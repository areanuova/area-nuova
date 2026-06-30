#!/usr/bin/env node
/**
 * Sync Aris External Sources — standalone Node.js script
 * Uso: node scripts/sync-aris-external.mjs [--source external-unifg] [--source external-adisu]
 *
 * Env richieste: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ── Load .env ─────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = join(__dirname, '..');

function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* .env potrebbe non esistere in CI */ }
}

loadEnv();

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL     = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY       = process.env.OPENAI_API_KEY;
const EMBED_MODEL      = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
const EMBEDDINGS_ENABLED = !!OPENAI_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Env mancanti: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!EMBEDDINGS_ENABLED) {
  console.warn('⚠️  OPENAI_API_KEY non trovata — gli embedding non verranno generati.');
  console.warn('   ExternalOfficialSourcesTool funziona via ricerca testuale su aris_external_documents.\n');
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const openai = EMBEDDINGS_ENABLED ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

const USER_AGENT    = 'ArisBot/1.0 (+https://areanuova.it/aris; university-assistant; educational)';
const FETCH_TIMEOUT = 12_000;
const RATE_DELAY_MS = 1_500;
const CHUNK_SIZE    = 1200;
const CHUNK_OVERLAP = 120;

// ── Sources ───────────────────────────────────────────────────────────────────

const SOURCES = [
  {
    id:                     'external-unifg',
    name:                   'Università di Foggia (unifg.it)',
    baseUrl:                'https://www.unifg.it',
    // Il sito usa /it/ come prefisso per tutti i path pubblici
    allowedPaths:           ['/it/studente', '/it/futuro-studente', '/it/laureato', '/it/servizi-e-opportunita', '/it/studiare', '/it/internazionale', '/it/avvisi', '/it/ateneo'],
    deniedPaths:            ['/admin', '/search', '/user', '/core/', '/profiles/', '/sites/default/files', '/filter', '/media/oembed'],
    refreshIntervalMinutes: 120,
    maxPagesPerSync:        25,
    allowInsecureTls:       false,
    entryPoints: [
      'https://www.unifg.it/it/studente',
      'https://www.unifg.it/it/futuro-studente',
      'https://www.unifg.it/it/servizi-e-opportunita',
      'https://www.unifg.it/it/servizi-e-opportunita/segreterie-online/tasse-e-contributi',
      'https://www.unifg.it/it/servizi-e-opportunita/segreterie-online/segreterie-studenti-info-e-contatti',
      'https://www.unifg.it/it/studiare/corsi-di-laurea/immatricolazioni',
      'https://www.unifg.it/it/studiare/corsi-di-laurea/manifesto-degli-studi',
      'https://www.unifg.it/it/internazionale/parti-con-unifg/studio-outgoing',
      'https://www.unifg.it/it/avvisi',
      'https://www.unifg.it/it/servizi-e-opportunita/opportunita/bandi-studenti',
      'https://www.unifg.it/it/servizi-e-opportunita/vita-universitaria/alloggi-e-mense',
    ],
    metadata: { ente: 'Università di Foggia' },
  },
  {
    id:                     'external-adisu',
    name:                   'ADISU Puglia (adisupuglia.it)',
    baseUrl:                'https://www.adisupuglia.it',
    // URL in formato /pagina{id}_{slug}.html (CMS legacy)
    allowedPaths:           ['/pagina'],
    deniedPaths:            ['/admin', '/wp-admin', '/cgi-bin', '/wp-login'],
    refreshIntervalMinutes: 90,
    maxPagesPerSync:        20,
    // ADISU serve catena TLS incompleta (Actalis OV CA G3 senza intermedio)
    allowInsecureTls:       true,
    entryPoints: [
      'https://www.adisupuglia.it/pagina106703_borse-di-studio.html',
      'https://www.adisupuglia.it/pagina116497_alloggi.html',
      'https://www.adisupuglia.it/pagina116512_graduatorie.html',
      'https://www.adisupuglia.it/pagina22130_faq.html',
      'https://www.adisupuglia.it/pagina136385_bando-orfani.html',
      'https://www.adisupuglia.it/pagina116488_bando-its.html',
    ],
    metadata: { ente: 'ADISU Puglia' },
  },
  {
    id:                     'external-mur',
    name:                   "MUR — Ministero dell'Università e della Ricerca",
    baseUrl:                'https://www.mur.gov.it',
    // Sezioni verificate: /it/aree-tematiche/universita/ e /it/housing-universitario/
    allowedPaths:           ['/it/aree-tematiche/universita', '/it/housing-universitario', '/it/aree-tematiche/ricerca'],
    deniedPaths:            ['/admin', '/search', '/user', '/core/', '/profiles/', '/filter', '/media/oembed', '/aree-tematiche/afam'],
    refreshIntervalMinutes: 240,
    maxPagesPerSync:        15,
    allowInsecureTls:       false,
    entryPoints: [
      'https://www.mur.gov.it/it/aree-tematiche/universita',
      'https://www.mur.gov.it/it/aree-tematiche/universita/le-universita/universita-statali',
      'https://www.mur.gov.it/it/aree-tematiche/universita/mobilita-internazionale',
      'https://www.mur.gov.it/it/aree-tematiche/universita/offerta-formativa/dottorati',
      'https://www.mur.gov.it/it/aree-tematiche/universita/programmazione-e-finanziamenti',
      'https://www.mur.gov.it/it/housing-universitario',
      'https://www.mur.gov.it/it/housing-universitario/avviso-housing',
      'https://www.mur.gov.it/it/housing-universitario/faq-e-chiarimenti',
    ],
    metadata: { ente: "MUR — Ministero Università e Ricerca" },
  },
];

// ── HTML parser ───────────────────────────────────────────────────────────────

const BLOCK_RE = /<(script|style|nav|header|footer|aside|form|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi;
const ENTITY   = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&egrave;': 'è', '&eacute;': 'é', '&agrave;': 'à', '&ugrave;': 'ù', '&igrave;': 'ì', '&ograve;': 'ò' };

function htmlToText(html) {
  return html
    .replace(BLOCK_RE, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z]+;/g, s => ENTITY[s] ?? ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitle(html) {
  const og    = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return og[1].trim();
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title) return title[1].replace(/\s*[|\-–—].*$/, '').trim();
  const h1    = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  return h1 ? h1[1].trim() : '';
}

function extractExcerpt(text, max = 300) {
  const c = text.replace(/\n+/g, ' ').trim();
  return c.length <= max ? c : c.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function extractLinks(html, baseUrl) {
  const base  = new URL(baseUrl);
  const links = new Set();
  const re    = /href=["']([^"'#?][^"']*?)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], baseUrl);
      if (u.hostname === base.hostname) { u.hash = ''; u.search = ''; links.add(u.href); }
    } catch {}
  }
  return [...links];
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

const lastFetch = new Map();

async function rateLimit(hostname) {
  const last = lastFetch.get(hostname) ?? 0;
  const wait = RATE_DELAY_MS - (Date.now() - last);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastFetch.set(hostname, Date.now());
}

async function fetchPage(url, allowInsecureTls = false) {
  const { hostname } = new URL(url);
  await rateLimit(hostname);

  // Temporarily disable TLS validation for sites with incomplete certificate chains (e.g. ADISU)
  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (allowInsecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      signal:  ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'it-IT,it;q=0.9' },
    });
    clearTimeout(timer);
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return { ok: false, html: '', error: 'non-html' };
    return { ok: res.ok, html: await res.text(), error: null };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, html: '', error: e.message };
  } finally {
    if (allowInsecureTls) {
      if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
    }
  }
}

// ── Embeddings ────────────────────────────────────────────────────────────────

function splitChunks(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const chunk = text.slice(start, start + CHUNK_SIZE).trim();
    if (chunk.length > 60) chunks.push(chunk);
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

async function generateEmbedding(text) {
  if (!openai) return null;
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input: text });
  return res.data[0].embedding;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

function computeHash(text) {
  return createHash('sha256').update(text.normalize('NFC').trim()).digest('hex');
}

function isStale(lastSyncAt, intervalMinutes) {
  if (!lastSyncAt) return true;
  return (Date.now() - new Date(lastSyncAt).getTime()) >= intervalMinutes * 60 * 1000;
}

async function syncSource(source) {
  const startedAt = new Date().toISOString();
  let pagesChecked = 0, pagesUpdated = 0, pagesSkipped = 0, embeddingsGenerated = 0;
  const errors = [];

  console.log(`\n▶ ${source.name}`);

  // Check freshness
  const { data: srcRow } = await sb.from('aris_external_sources').select('last_sync_at').eq('id', source.id).maybeSingle();
  if (!forceSync && srcRow && !isStale(srcRow.last_sync_at, source.refreshIntervalMinutes)) {
    console.log(`  ⏭ Fresca — skip (last sync: ${srcRow.last_sync_at})`);
    return { pagesChecked: 0, pagesUpdated: 0, pagesSkipped: 0, embeddingsGenerated: 0, errors: [], status: 'success' };
  }

  // Collect URLs
  const seen   = new Set();
  const queue  = [...source.entryPoints];
  const toFetch = [];

  while (toFetch.length < source.maxPagesPerSync && queue.length > 0) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const path    = new URL(url).pathname;
    const allowed = source.allowedPaths.some(p => path.startsWith(p));
    const denied  = source.deniedPaths.some(p => path.startsWith(p));
    if (allowed && !denied) toFetch.push(url);
  }

  for (const url of toFetch.slice(0, source.maxPagesPerSync)) {
    pagesChecked++;
    const result = await fetchPage(url, source.allowInsecureTls);

    if (!result.ok) {
      if (result.error && result.error !== 'non-html') errors.push(`${url}: ${result.error}`);
      continue;
    }

    // Discover links
    const links = extractLinks(result.html, url);
    for (const l of links) { if (!seen.has(l)) queue.push(l); }

    const title   = extractTitle(result.html);
    const content = htmlToText(result.html).slice(0, 8000);
    if (!title || content.length < 100) { pagesSkipped++; continue; }

    const excerpt = extractExcerpt(content);
    const hash    = computeHash(content);

    // Check existing
    const { data: existing } = await sb.from('aris_external_documents').select('content_hash').eq('url', url).maybeSingle();
    if (existing?.content_hash === hash) {
      await sb.from('aris_external_documents').update({ last_seen_at: new Date().toISOString() }).eq('url', url);
      pagesSkipped++;
      continue;
    }

    // Upsert aris_external_documents
    await sb.from('aris_external_documents').upsert(
      { source_id: source.id, url, title, content, excerpt, content_hash: hash, last_seen_at: new Date().toISOString(), status: 'active', metadata: source.metadata },
      { onConflict: 'url' }
    );

    // Upsert aris_documents + embeddings (solo se OPENAI disponibile)
    if (EMBEDDINGS_ENABLED) {
      const { data: docRow } = await sb.from('aris_documents').upsert(
        { source: source.id, source_id: url.slice(0, 500), url, titolo: title, contenuto: content.slice(0, 5000), updated_at: new Date().toISOString() },
        { onConflict: 'source,source_id' }
      ).select('id').maybeSingle();

      if (docRow?.id) {
        await sb.from('aris_embeddings').delete().eq('document_id', docRow.id);
        for (const chunk of splitChunks(content)) {
          try {
            const embedding = await generateEmbedding(chunk);
            if (!embedding) break;
            await sb.from('aris_embeddings').insert({ document_id: docRow.id, chunk_text: chunk, embedding });
            embeddingsGenerated++;
          } catch (e) { errors.push(`embedding ${url}: ${e.message}`); }
        }
      }
    }

    pagesUpdated++;
    console.log(`  ✅ ${title.slice(0, 60)}`);
  }

  // Update source
  await sb.from('aris_external_sources').upsert(
    { id: source.id, name: source.name, base_url: source.baseUrl, priority: 80, refresh_interval_minutes: source.refreshIntervalMinutes, last_sync_at: new Date().toISOString(), is_active: true },
    { onConflict: 'id' }
  );

  const completedAt = new Date().toISOString();
  const status = errors.length === 0 ? 'success' : (pagesUpdated > 0 ? 'partial' : 'failed');

  await sb.from('aris_external_sync_logs').insert({
    source_id: source.id, started_at: startedAt, completed_at: completedAt,
    pages_fetched: pagesChecked, pages_updated: pagesUpdated, pages_skipped: pagesSkipped,
    embeddings_generated: embeddingsGenerated, errors, status,
  });

  console.log(`  → ${pagesUpdated} aggiornati, ${pagesSkipped} invariati, ${errors.length} errori`);
  return { pagesChecked, pagesUpdated, pagesSkipped, embeddingsGenerated, errors, status };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filterIds = [];
let forceSync = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--source' && args[i + 1]) filterIds.push(args[++i]);
  if (args[i] === '--force') forceSync = true;
}

const sources = filterIds.length
  ? SOURCES.filter(s => filterIds.includes(s.id))
  : SOURCES;

console.log(`🔄 Aris External Sync — ${new Date().toLocaleString('it-IT')}`);
console.log(`   Sorgenti: ${sources.map(s => s.id).join(', ')}\n`);

let totalUpdated = 0;
let totalErrors  = 0;

for (const source of sources) {
  const r = await syncSource(source);
  totalUpdated += r.pagesUpdated;
  totalErrors  += r.errors.length;
}

console.log(`\n✅ Sync completato — ${totalUpdated} pagine aggiornate, ${totalErrors} errori`);
if (totalErrors > 0) process.exit(1);
