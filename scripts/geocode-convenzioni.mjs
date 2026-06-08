#!/usr/bin/env node
/**
 * Geocodifica le convenzioni con indirizzo ma senza lat/lng usando Nominatim/OSM.
 * Rispetta il rate limit di Nominatim: max 1 richiesta al secondo.
 * Aggiorna i file markdown inserendo lat e lng nel frontmatter.
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

/** Ritorna true se il campo esiste nel testo YAML. */
function hasField(yaml, field) {
  return new RegExp(`^${field}:`, 'm').test(yaml);
}

/** Divide il contenuto markdown in frontmatter YAML e body. */
function parseMd(content) {
  // Il file inizia con "---\n", poi yaml, poi "\n---" e poi il body.
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
