/**
 * ingest-aris.mjs
 * Legge tutte le content collections Markdown, genera embeddings
 * e li salva in Supabase per alimentare la pipeline RAG di Aris.
 *
 * Uso: npm run aris:index
 *
 * Variabili d'ambiente richieste nel file .env:
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *   OPENAI_EMBEDDING_MODEL  (opzionale, default: text-embedding-3-small)
 */

import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = join(__dirname, '..');

// ── Load .env (senza dipendenza da dotenv) ──────────────
function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* .env potrebbe non esistere in CI */ }
}

loadEnv();

// ── Configurazione ───────────────────────────────────────
const SUPABASE_URL  = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY    = process.env.OPENAI_API_KEY;
const EMBED_MODEL   = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
const CHUNK_SIZE    = 460;

// Embeddings are optional: without OPENAI_API_KEY only aris_documents is populated.
// Structured tools (GuideTool, ConvenzioniTool, WhatsAppTool…) work via keyword
// search on aris_documents and do NOT require embeddings. Only RagTool needs them.
const EMBEDDINGS_ENABLED = !!OPENAI_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Mancano le variabili d\'ambiente. Controlla il file .env:');
  console.error('    PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!EMBEDDINGS_ENABLED) {
  console.warn('⚠️  OPENAI_API_KEY non trovata — gli embedding non verranno generati.');
  console.warn('   I tool strutturati funzioneranno; RagTool (ricerca semantica) no.\n');
}

const sb     = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const openai = EMBEDDINGS_ENABLED ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

// ── Frontmatter parser minimale ──────────────────────────
function parseMd(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { data: {}, body: raw.trim() };

  const yaml = match[1];
  const body = raw.slice(match[0].length).trim();
  const data = {};
  let currentKey = null;
  let inArray    = false;
  let arr        = [];

  for (const line of yaml.split('\n')) {
    const item = line.match(/^  - (.+)$/);
    const kv   = line.match(/^([a-zA-Z_]\w*): ?(.*)$/);

    if (item && inArray && currentKey) {
      arr.push(item[1].trim().replace(/^["']|["']$/g, ''));
    } else if (kv) {
      if (inArray && currentKey) { data[currentKey] = arr; inArray = false; arr = []; }
      currentKey  = kv[1];
      const val   = kv[2].trim();
      if (val === '')        { inArray = true; arr = []; }
      else if (val === 'true')  data[currentKey] = true;
      else if (val === 'false') data[currentKey] = false;
      else if (!isNaN(Number(val)) && val !== '') data[currentKey] = Number(val);
      else data[currentKey] = val.replace(/^["']|["']$/g, '');
    }
  }
  if (inArray && currentKey) data[currentKey] = arr;

  return { data, body };
}

// ── Text chunker ─────────────────────────────────────────
function splitChunks(text, maxSize = CHUNK_SIZE) {
  const norm = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!norm) return [];
  if (norm.length <= maxSize) return [norm];

  const paras  = norm.split(/\n\n+/);
  const chunks = [];
  let   cur    = '';

  for (const para of paras) {
    const cand = cur ? `${cur}\n\n${para}` : para;
    if (cand.length <= maxSize) { cur = cand; continue; }
    if (cur) chunks.push(cur.trim());
    cur = para.length > maxSize
      ? para.slice(0, maxSize)
      : para;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter((c) => c.length >= 20);
}

// ── Embedding ─────────────────────────────────────────────
async function embed(text) {
  if (!openai) return null;
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text.replace(/\n+/g, ' ').slice(0, 8000),
  });
  return res.data[0].embedding;
}

// ── Salva documento + chunk/embeddings ───────────────────
async function indexDocument({ source, source_id, titolo, url, contenuto, metadata }) {
  // Upsert documento
  const { data: doc, error: e1 } = await sb
    .from('aris_documents')
    .upsert(
      { source, source_id, titolo, url: url ?? null, contenuto, metadata: metadata ?? {}, updated_at: new Date().toISOString() },
      { onConflict: 'source,source_id' },
    )
    .select('id')
    .single();

  if (e1 || !doc) { console.error(`  ⚠  Errore salvataggio: ${e1?.message}`); return 0; }

  const docId  = doc.id;

  if (!EMBEDDINGS_ENABLED) return 0;

  await sb.from('aris_embeddings').delete().eq('document_id', docId);

  const chunks = splitChunks(contenuto);
  let   ok     = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const emb = await embed(chunks[i]);
      if (!emb) break;
      await sb.from('aris_embeddings').insert({ document_id: docId, chunk_index: i, chunk_text: chunks[i], embedding: emb });
      ok++;
    } catch (err) {
      console.error(`  ⚠  Chunk ${i} fallito: ${err.message}`);
    }
  }

  return ok;
}

// ── Lettura collection Markdown ───────────────────────────
async function readCollection(collectionName) {
  const dir = join(ROOT, 'src', 'content', collectionName);
  let files;
  try { files = await readdir(dir); }
  catch { return []; }
  return files.filter((f) => extname(f) === '.md');
}

// ── Costruttori per ogni collection ──────────────────────
async function ingestGuide() {
  const files = await readCollection('guide');
  let total = 0;
  for (const file of files) {
    const raw   = await readFile(join(ROOT, 'src/content/guide', file), 'utf8');
    const { data, body } = parseMd(raw);
    if (!data.titolo) continue;
    const slug = file.replace(/\.md$/, '');
    const contenuto = [
      `Guida: ${data.titolo}`,
      data.estratto ? `Riepilogo: ${data.estratto}` : '',
      `Categoria: ${data.categoria ?? 'Generale'}`,
      '',
      body,
    ].filter(Boolean).join('\n');
    const n = await indexDocument({
      source: 'guide', source_id: slug,
      titolo: data.titolo, url: `/guide/${slug}`,
      contenuto, metadata: { categoria: data.categoria, perMatricole: data.perMatricole },
    });
    console.log(`  ✓ Guide: ${data.titolo} (${n} chunk)`);
    total += n;
  }
  return total;
}

async function ingestNews() {
  const files = await readCollection('news');
  let total = 0;
  for (const file of files) {
    const raw = await readFile(join(ROOT, 'src/content/news', file), 'utf8');
    const { data, body } = parseMd(raw);
    if (!data.titolo || data.bozza) continue;
    const slug = file.replace(/\.md$/, '');
    const contenuto = [
      `News: ${data.titolo}`,
      data.estratto ? `Riepilogo: ${data.estratto}` : '',
      `Categoria: ${data.categoria ?? ''}`,
      `Data: ${data.data ?? ''}`,
      '',
      body,
    ].filter(Boolean).join('\n');
    const n = await indexDocument({
      source: 'news', source_id: slug,
      titolo: data.titolo, url: `/news/${slug}`,
      contenuto, metadata: { data: data.data, categoria: data.categoria },
    });
    console.log(`  ✓ News: ${data.titolo} (${n} chunk)`);
    total += n;
  }
  return total;
}

async function ingestConvenzioni() {
  const files = await readCollection('convenzioni');
  let total = 0;
  for (const file of files) {
    const raw = await readFile(join(ROOT, 'src/content/convenzioni', file), 'utf8');
    const { data } = parseMd(raw);
    if (!data.nome || data.attiva === false) continue;
    const slug = file.replace(/\.md$/, '');
    const offerte = Array.isArray(data.offerte) ? data.offerte.join('; ') : '';
    const contenuto = [
      `Convenzione Discount Card Area Nuova: ${data.nome}`,
      `Città: ${data.citta}`, `Categoria: ${data.categoria}`,
      `Tipo: ${data.tipo}`,
      offerte ? `Offerte: ${offerte}` : '',
      data.indirizzo ? `Indirizzo: ${data.indirizzo}` : '',
    ].filter(Boolean).join('\n');
    const n = await indexDocument({
      source: 'convenzioni', source_id: slug,
      titolo: data.nome, url: '/convenzioni',
      contenuto, metadata: { citta: data.citta, categoria: data.categoria, tipo: data.tipo },
    });
    console.log(`  ✓ Convenzione: ${data.nome} (${n} chunk)`);
    total += n;
  }
  return total;
}

async function ingestDocumenti() {
  const files = await readCollection('documenti');
  let total = 0;
  for (const file of files) {
    const raw = await readFile(join(ROOT, 'src/content/documenti', file), 'utf8');
    const { data, body } = parseMd(raw);
    if (!data.titolo) continue;
    const slug = file.replace(/\.md$/, '');
    const contenuto = [
      `Documento / Modulistica: ${data.titolo}`,
      `Tipo: ${data.tipo}`, `Categoria: ${data.categoria}`,
      `Anno: ${data.anno ?? ''}`,
      data.descrizione ? `Descrizione: ${data.descrizione}` : '',
      body,
    ].filter(Boolean).join('\n');
    const n = await indexDocument({
      source: 'documenti', source_id: slug,
      titolo: data.titolo, url: '/modulistica',
      contenuto, metadata: { tipo: data.tipo, anno: data.anno },
    });
    console.log(`  ✓ Documento: ${data.titolo} (${n} chunk)`);
    total += n;
  }
  return total;
}

async function ingestEventi() {
  const files = await readCollection('eventi');
  let total = 0;
  for (const file of files) {
    const raw = await readFile(join(ROOT, 'src/content/eventi', file), 'utf8');
    const { data, body } = parseMd(raw);
    if (!data.titolo) continue;
    const slug = file.replace(/\.md$/, '');
    const contenuto = [
      `Evento: ${data.titolo}`,
      `Data: ${data.data ?? ''}`, `Luogo: ${data.luogo ?? ''}`,
      `Descrizione: ${data.descrizione ?? ''}`,
      body,
    ].filter(Boolean).join('\n');
    const n = await indexDocument({
      source: 'eventi', source_id: slug,
      titolo: data.titolo, url: `/eventi/${slug}`,
      contenuto, metadata: { data: data.data, luogo: data.luogo, categoria: data.categoria },
    });
    console.log(`  ✓ Evento: ${data.titolo} (${n} chunk)`);
    total += n;
  }
  return total;
}

async function ingestProgetti() {
  const files = await readCollection('progetti');
  let total = 0;
  for (const file of files) {
    const raw = await readFile(join(ROOT, 'src/content/progetti', file), 'utf8');
    const { data, body } = parseMd(raw);
    if (!data.titolo) continue;
    const slug = file.replace(/\.md$/, '');
    const contenuto = [
      `Progetto Area Nuova: ${data.titolo}`,
      `Descrizione: ${data.descrizione ?? ''}`,
      `Stato: ${data.stato ?? ''}`, `Categoria: ${data.categoria ?? ''}`,
      body,
    ].filter(Boolean).join('\n');
    const n = await indexDocument({
      source: 'progetti', source_id: slug,
      titolo: data.titolo, url: `/progetti/${slug}`,
      contenuto, metadata: { stato: data.stato, categoria: data.categoria },
    });
    console.log(`  ✓ Progetto: ${data.titolo} (${n} chunk)`);
    total += n;
  }
  return total;
}

async function ingestGruppiWhatsapp() {
  const files = await readCollection('gruppi-whatsapp');
  let total = 0;
  for (const file of files) {
    const raw = await readFile(join(ROOT, 'src/content/gruppi-whatsapp', file), 'utf8');
    const { data, body } = parseMd(raw);
    if (!data.titolo || data.attivo === false) continue;
    const slug    = file.replace(/\.md$/, '');
    const corsi   = Array.isArray(data.corsi) ? data.corsi.join(', ') : (data.corsi ?? '');
    const contenuto = [
      `Gruppo WhatsApp UniFg: ${data.titolo}`,
      `Area: ${data.area ?? ''}`, `Corsi: ${corsi}`,
      `Livello: ${data.livello ?? ''}`, `Tipologia: ${data.tipologia ?? ''}`,
      data.annoAccademico ? `Anno accademico: ${data.annoAccademico}` : '',
      body,
    ].filter(Boolean).join('\n');
    const n = await indexDocument({
      source: 'gruppi-whatsapp', source_id: slug,
      titolo: data.titolo, url: '/gruppi-whatsapp',
      contenuto, metadata: { area: data.area, corsi: data.corsi, livello: data.livello },
    });
    console.log(`  ✓ Gruppo WA: ${data.titolo} (${n} chunk)`);
    total += n;
  }
  return total;
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log('\n🚀  Avvio ingestione contenuti per Aris…\n');
  const t0 = Date.now();
  let grand = 0;

  console.log('📚  Guide…');
  grand += await ingestGuide();

  console.log('\n📰  News…');
  grand += await ingestNews();

  console.log('\n💳  Convenzioni…');
  grand += await ingestConvenzioni();

  console.log('\n📄  Documenti e modulistica…');
  grand += await ingestDocumenti();

  console.log('\n📅  Eventi…');
  grand += await ingestEventi();

  console.log('\n🚀  Progetti…');
  grand += await ingestProgetti();

  console.log('\n👥  Gruppi WhatsApp…');
  grand += await ingestGruppiWhatsapp();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅  Ingestione completata in ${elapsed}s — ${grand} chunk indicizzati.\n`);
}

main().catch((err) => {
  console.error('\n❌  Errore fatale:', err.message);
  process.exit(1);
});
