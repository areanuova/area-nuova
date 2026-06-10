#!/usr/bin/env node
/**
 * Geocodifica le convenzioni con indirizzo ma senza lat/lng usando Nominatim/OSM.
 * Rispetta il rate limit di Nominatim: max 1 richiesta al secondo.
 * Aggiorna i file markdown inserendo lat e lng nel frontmatter.
 * Supporta sia il campo singolo `indirizzo` sia il blocco `sedi` (array di sedi).
 *
 * Uso: node scripts/geocode-convenzioni.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '..', 'src', 'content', 'convenzioni');
const USER_AGENT = 'AreaNuovaUniFg/1.0 (areanuova@unifg.it)';
const DELAY_MS = 1200; // > 1 sec per rispettare il rate limit Nominatim

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Estrae un campo scalare semplice dal testo YAML del frontmatter. */
function extractField(yaml, field) {
  const re = new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, 'm');
  const m = yaml.match(re);
  return m ? m[1].trim() : null;
}

/** Ritorna true se il campo (top-level) esiste nel testo YAML. */
function hasField(yaml, field) {
  return new RegExp(`^${field}:`, 'm').test(yaml);
}

/** Ritorna true se il YAML contiene un blocco `sedi:`. */
function hasSedi(yaml) {
  return /^sedi:/m.test(yaml);
}

/** Divide il contenuto markdown in frontmatter YAML e body. */
function parseMd(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---(\n[\s\S]*)?$/);
  if (!match) return null;
  return { yaml: match[1], body: match[2] ?? '' };
}

/** Ricostruisce il file con il YAML aggiornato. */
function buildMd(yaml, body) {
  return `---\n${yaml}\n---${body}`;
}

/** Chiama Nominatim e restituisce { lat, lng } oppure null. */
async function geocode(address) {
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(address)}` +
    `&format=json&limit=1&countrycodes=it&addressdetails=0`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'it',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  };
}

// ── Report accumulatori ──────────────────────────────────────────────────────
const updated = [];
const alreadyComplete = [];
const noAddress = [];
const errors = [];

// ── Gestione file con sedi multiple ─────────────────────────────────────────

/**
 * Geocodifica le sedi di un file con blocco `sedi:`.
 * Ogni item ha: nome (inline), indirizzo (4-space indent), lat/lng (4-space indent).
 * Inserisce lat/lng dopo ogni `    indirizzo:` che non li ha ancora.
 */
async function processSediFile(file, filePath, yaml, body, nome) {
  const lines = yaml.split('\n');
  let inSediBlock = false;
  let currentItemStart = -1;
  const sedeItems = []; // { startLine, endLine }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inSediBlock) {
      if (/^sedi:/.test(line)) inSediBlock = true;
      continue;
    }

    // Fine blocco sedi: riga non-indentata (chiave top-level)
    if (/^[a-zA-Z#]/.test(line)) {
      if (currentItemStart >= 0) {
        sedeItems.push({ startLine: currentItemStart, endLine: i - 1 });
        currentItemStart = -1;
      }
      inSediBlock = false;
      continue;
    }

    // Nuovo item: `  - `
    if (/^\s{2}-\s/.test(line)) {
      if (currentItemStart >= 0) {
        sedeItems.push({ startLine: currentItemStart, endLine: i - 1 });
      }
      currentItemStart = i;
    }
  }
  // Ultimo item (sedi è l'ultimo campo del file)
  if (currentItemStart >= 0) {
    sedeItems.push({ startLine: currentItemStart, endLine: lines.length - 1 });
  }

  const insertions = []; // { afterLineIdx, newLines[] }
  let anyNeedsGeocoding = false;

  for (const item of sedeItems) {
    const itemLines = lines.slice(item.startLine, item.endLine + 1);

    const hasLat = itemLines.some((l) => /^\s{4}lat:/.test(l));
    const indirizzoIdx = itemLines.findIndex((l) => /^\s{4}indirizzo:/.test(l));

    if (indirizzoIdx < 0 || hasLat) continue;

    anyNeedsGeocoding = true;
    const indirizzoLine = itemLines[indirizzoIdx];
    const indirizzoMatch = indirizzoLine.match(/indirizzo:\s*["']?(.*?)["']?\s*$/);
    if (!indirizzoMatch) continue;
    const indirizzo = indirizzoMatch[1].trim();

    const nomeMatch = itemLines[0].match(/nome:\s*["']?(.*?)["']?\s*$/);
    const sedeNome = nomeMatch ? nomeMatch[1].trim() : indirizzo;

    process.stdout.write(`Geocodificando: ${nome} – "${sedeNome}" → "${indirizzo}" ... `);

    try {
      await sleep(DELAY_MS);
      const coords = await geocode(indirizzo);

      if (!coords) {
        console.log('NESSUN RISULTATO');
        errors.push({ file, nome: `${nome} – ${sedeNome}`, reason: 'nessun risultato da Nominatim' });
        continue;
      }

      console.log(`OK  lat=${coords.lat.toFixed(6)}  lng=${coords.lng.toFixed(6)}`);

      // Inserisci lat/lng dopo la riga indirizzo nell'array originale
      insertions.push({
        afterLineIdx: item.startLine + indirizzoIdx,
        newLines: [`    lat: ${coords.lat}`, `    lng: ${coords.lng}`],
      });
      updated.push({ file, nome: `${nome} – ${sedeNome}`, lat: coords.lat, lng: coords.lng });
    } catch (err) {
      console.log(`ERRORE: ${err.message}`);
      errors.push({ file, nome: `${nome} – ${sedeNome}`, reason: err.message });
    }
  }

  if (!anyNeedsGeocoding) {
    alreadyComplete.push({ file, nome });
    return;
  }

  if (insertions.length === 0) return;

  // Applica le inserzioni in ordine inverso per mantenere gli indici corretti
  const updatedLines = [...lines];
  insertions.sort((a, b) => b.afterLineIdx - a.afterLineIdx);
  for (const ins of insertions) {
    updatedLines.splice(ins.afterLineIdx + 1, 0, ...ins.newLines);
  }

  writeFileSync(filePath, buildMd(updatedLines.join('\n'), body), 'utf-8');
}

// ── Elaborazione file ────────────────────────────────────────────────────────
const files = readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();

console.log(`\n=== GEOCODING CONVENZIONI (${files.length} file) ===\n`);

for (const file of files) {
  const filePath = join(CONTENT_DIR, file);
  const content = readFileSync(filePath, 'utf-8');
  const parsed = parseMd(content);

  if (!parsed) {
    errors.push({ file, reason: 'frontmatter non parsabile' });
    continue;
  }

  const { yaml, body } = parsed;
  const nome = extractField(yaml, 'nome') ?? file;

  // ── File con sedi multiple ────────────────────────────────────────────────
  if (hasSedi(yaml)) {
    await processSediFile(file, filePath, yaml, body, nome);
    continue;
  }

  // ── File con indirizzo singolo ─────────────────────────────────────────────

  // Nessun indirizzo → salta
  if (!hasField(yaml, 'indirizzo')) {
    noAddress.push({ file, nome });
    continue;
  }

  // Già ha lat e lng → già completo
  if (hasField(yaml, 'lat') && hasField(yaml, 'lng')) {
    alreadyComplete.push({ file, nome });
    continue;
  }

  const indirizzo = extractField(yaml, 'indirizzo');
  if (!indirizzo) {
    errors.push({ file, nome, reason: 'campo indirizzo vuoto' });
    continue;
  }

  process.stdout.write(`Geocodificando: ${nome} → "${indirizzo}" ... `);

  try {
    await sleep(DELAY_MS);
    const coords = await geocode(indirizzo);

    if (!coords) {
      console.log('NESSUN RISULTATO');
      errors.push({ file, nome, reason: 'nessun risultato da Nominatim' });
      continue;
    }

    console.log(`OK  lat=${coords.lat.toFixed(6)}  lng=${coords.lng.toFixed(6)}`);

    // Inserisce lat e lng subito dopo la riga "indirizzo: ..."
    const updatedYaml = yaml.replace(
      /^(indirizzo:.+)$/m,
      `$1\nlat: ${coords.lat}\nlng: ${coords.lng}`
    );

    writeFileSync(filePath, buildMd(updatedYaml, body), 'utf-8');
    updated.push({ file, nome, ...coords });
  } catch (err) {
    console.log(`ERRORE: ${err.message}`);
    errors.push({ file, nome, reason: err.message });
  }
}

// ── Report finale ────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║              REPORT GEOCODING COMPLETATO             ║');
console.log('╚══════════════════════════════════════════════════════╝');

console.log(`\n✓ Aggiornate con coordinate (${updated.length}):`);
updated.forEach((r) =>
  console.log(`  · ${r.nome.padEnd(52)} lat=${r.lat.toFixed(6)}  lng=${r.lng.toFixed(6)}`)
);

console.log(`\n● Già complete (${alreadyComplete.length}):`);
alreadyComplete.forEach((r) => console.log(`  · ${r.nome}`));

console.log(`\n○ Senza indirizzo – non geocodificate (${noAddress.length}):`);
noAddress.forEach((r) => console.log(`  · ${r.nome}`));

console.log(`\n✗ Errori (${errors.length}):`);
errors.forEach((r) => console.log(`  · ${r.nome ?? r.file}: ${r.reason}`));

console.log('');
