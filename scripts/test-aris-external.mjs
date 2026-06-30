#!/usr/bin/env node
/**
 * QA script — External Sources Sync
 * Testa: URL reachability, robots.txt, planner selection, dedup logic, struttura file
 * Non richiede SUPABASE_SERVICE_ROLE_KEY o OPENAI_API_KEY
 */

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';
const INFO = 'ℹ️ ';

let totalPass = 0;
let totalFail = 0;
let totalWarn = 0;

function pass(msg) { console.log(`  ${PASS} ${msg}`); totalPass++; }
function fail(msg) { console.log(`  ${FAIL} ${msg}`); totalFail++; }
function warn(msg) { console.log(`  ${WARN} ${msg}`); totalWarn++; }
function info(msg) { console.log(`  ${INFO} ${msg}`); }
function section(title) { console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`); }

// ── 0. STRUTTURA FILE ─────────────────────────────────────────────────────────

section('0. Struttura file');

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_FILES = [
  'src/lib/aris/external/types.ts',
  'src/lib/aris/external/fetcher.ts',
  'src/lib/aris/external/parser.ts',
  'src/lib/aris/external/dedupe.ts',
  'src/lib/aris/external/freshness.ts',
  'src/lib/aris/external/registry.ts',
  'src/lib/aris/external/sync.ts',
  'src/lib/aris/external/sources/unifg-source.ts',
  'src/lib/aris/external/sources/adisu-source.ts',
  'src/lib/aris/external/sources/mur-source.ts',
  'src/lib/aris/tools/external-official-sources-tool.ts',
  'src/pages/api/aris/sync-external.ts',
  'scripts/sync-aris-external.mjs',
  'supabase/migrations/20240103000000_aris_external.sql',
  '.github/workflows/aris-external-sync.yml',
  'vercel.json',
];

for (const f of REQUIRED_FILES) {
  if (existsSync(resolve(f))) {
    pass(f);
  } else {
    fail(`MANCANTE: ${f}`);
  }
}

// ── 1. DEDUPLICA LOGIC ────────────────────────────────────────────────────────

section('1. Deduplicazione SHA-256');

import { createHash } from 'node:crypto';

function computeHash(text) {
  return createHash('sha256').update(text.normalize('NFC').trim()).digest('hex');
}

const txt1 = 'Benvenuti all\'Università di Foggia';
const txt2 = 'Benvenuti all\'Università di Foggia';
const txt3 = 'Tasse universitarie 2025/2026';

const h1 = computeHash(txt1);
const h2 = computeHash(txt2);
const h3 = computeHash(txt3);

if (h1 === h2) {
  pass(`Testo identico → stesso hash (${h1.slice(0, 16)}…)`);
} else {
  fail('Testo identico → hash diversi (bug!)');
}

if (h1 !== h3) {
  pass('Testo diverso → hash diversi');
} else {
  fail('Testo diverso → hash identici (bug!)');
}

// Verifica normalizzazione NFC (caratteri italiani)
const a = 'università';
const b = 'università'; // decomposed 'à'
const hA = computeHash(a);
const hB = computeHash(b);
if (hA === hB) {
  pass('Normalizzazione NFC: à composto = à decomposto');
} else {
  warn('NFC normalizzazione: hash diversi per à composto vs decomposto');
}

// ── 2. FRESHNESS LOGIC ────────────────────────────────────────────────────────

section('2. Freshness — isStale()');

function isStale(lastSeenAt, intervalMinutes) {
  if (!lastSeenAt) return true;
  return (Date.now() - new Date(lastSeenAt).getTime()) >= intervalMinutes * 60 * 1000;
}

// Null → sempre stale
if (isStale(null, 120)) pass('null last_seen_at → stale = true');
else fail('null last_seen_at → dovrebbe essere stale');

// 1 ora fa con intervallo 2 ore → non stale
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
if (!isStale(oneHourAgo, 120)) pass('1h fa, intervallo 2h → stale = false');
else fail('1h fa, intervallo 2h → non dovrebbe essere stale');

// 3 ore fa con intervallo 2 ore → stale
const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
if (isStale(threeHoursAgo, 120)) pass('3h fa, intervallo 2h → stale = true');
else fail('3h fa, intervallo 2h → dovrebbe essere stale');

// ── 3. PARSER HTML ────────────────────────────────────────────────────────────

section('3. Parser HTML');

const BLOCK_RE = /<(script|style|nav|header|footer|aside|form|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi;
const ENTITY   = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&egrave;': 'è', '&eacute;': 'é', '&agrave;': 'à' };

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

const testHtml = `
<html><head>
  <title>Immatricolazioni 2025/2026 | Università di Foggia</title>
  <script>alert("xss")</script>
  <style>.foo{color:red}</style>
</head><body>
  <nav>Menu nav</nav>
  <header>Header UniFg</header>
  <main>
    <h1>Immatricolazioni</h1>
    <p>Per immatricolarti all&apos;università devi compilare il modulo&nbsp;entro il 30 settembre.</p>
    <p>La tassa è di &euro;156,00 per l&apos;anno accademico 2025/26.</p>
  </main>
  <footer>Footer sito</footer>
</body></html>
`;

const title = extractTitle(testHtml);
const text  = htmlToText(testHtml);

if (title === 'Immatricolazioni 2025/2026') {
  pass(`extractTitle() → "${title}"`);
} else {
  fail(`extractTitle() → "${title}" (atteso "Immatricolazioni 2025/2026")`);
}

if (!text.includes('<script>') && !text.includes('<nav>') && !text.includes('<footer>')) {
  pass('htmlToText() rimuove script/nav/footer');
} else {
  fail('htmlToText() non rimuove tag bloccanti');
}

if (text.includes('Immatricolazioni') && text.includes('immatricolarti')) {
  pass('htmlToText() mantiene il contenuto principale');
} else {
  fail('htmlToText() ha perso contenuto');
}

if (!text.includes('Menu nav') && !text.includes('Header UniFg') && !text.includes('Footer sito')) {
  pass('htmlToText() rimuove nav/header/footer content');
} else {
  fail('htmlToText() non ha rimosso nav/header/footer content');
}

// ── 4. PLANNER — canHandle() SIMULATION ──────────────────────────────────────

section('4. Planner — canHandle() per ExternalOfficialSourcesTool');

const EXT_PATTERNS = [
  /\bunifg\b/i,
  /\buniversit[aà]\s+di\s+foggia\b/i,
  /\bateneo\b/i,
  /\bsegreteria\s+(?:studenti|universitaria)\b/i,
  /\bimmatricolazione\b/i,
  /\btasse\s+universitarie\b/i,
  /\berasmus\b/i,
  /\bcalendario\s+accademico\b/i,
  /\bmanifesto\s+(?:degli\s+studi|studi)\b/i,
  /\bpiano\s+di\s+studi\b/i,
  /\badisu\b/i,
  /\bdiritto\s+allo\s+studio\b/i,
  /\bborsa\s+di\s+studio\b/i,
  /\bgraduatoria\b/i,
  /\bcontributo\s+universitari[oa]\b/i,
  /\bmur\b/i,
  /\bministero\s+(?:dell[ae]?\s+)?universit[aà]\b/i,
  /\baccesso\s+(?:a|ai?)\s+medicina\b/i,
  /\baccesso\s+programmato\b/i,
  /\bdecreto\s+ministeriale\b/i,
  /\bfonti?\s+ufficiali?\b/i,
  /\bscadenz[ae]\s+(?:ufficiali?|iscrizioni?)\b/i,
  /\bavvisi?\s+ufficiali?\b/i,
  /\bbando\s+(?:ufficiale|ammissione|dottorato)\b/i,
  /\bregolamenta?zione\s+ministeriale\b/i,
];

function scorePatterns(patterns, query) {
  const matches = patterns.filter(p => p.test(query)).length;
  if (matches === 0) return 0;
  return Math.min(60 + matches * 10, 95);
}

const QA_QUERIES = [
  { q: 'Quando scade la borsa ADISU?',                         expectMin: 60 },
  { q: 'Quali sono gli ultimi avvisi UniFg?',                  expectMin: 60 },
  { q: 'Dove trovo il calendario accademico UniFg?',           expectMin: 70 },
  { q: 'Cosa dice il MUR sull\'accesso a Medicina?',           expectMin: 70 },
  // Negative — non dovrebbe intercettare
  { q: 'Ho bisogno di un appartamento economico',              expectMax: 10 },
  { q: 'Quali convenzioni ci sono per gli studenti?',          expectMax: 10 },
  { q: 'Quando si aprono le iscrizioni agli esami su ESSE3?',  expectMax: 30 },
];

for (const { q, expectMin, expectMax } of QA_QUERIES) {
  const score = scorePatterns(EXT_PATTERNS, q);
  if (expectMin !== undefined) {
    if (score >= expectMin) {
      pass(`"${q.slice(0, 50)}" → score=${score} (≥${expectMin})`);
    } else {
      fail(`"${q.slice(0, 50)}" → score=${score} (atteso ≥${expectMin})`);
    }
  }
  if (expectMax !== undefined) {
    if (score <= expectMax) {
      pass(`"${q.slice(0, 50)}" → score=${score} (≤${expectMax}) — correttamente NON intercettato`);
    } else {
      warn(`"${q.slice(0, 50)}" → score=${score} (>${expectMax}) — potrebbe intercettare per sbaglio`);
    }
  }
}

// ── 5. URL REACHABILITY + ROBOTS.TXT ─────────────────────────────────────────

section('5. URL reachability e robots.txt');

const USER_AGENT    = 'ArisBot/1.0 (+https://areanuova.it/aris; university-assistant; educational)';
const FETCH_TIMEOUT = 15_000;

// URL verificati e corretti per ogni sorgente
const ALL_ENTRY_POINTS = [
  // UniFg — usa /it/ come prefisso
  { source: 'external-unifg', url: 'https://www.unifg.it/it/studente' },
  { source: 'external-unifg', url: 'https://www.unifg.it/it/futuro-studente' },
  { source: 'external-unifg', url: 'https://www.unifg.it/it/servizi-e-opportunita/segreterie-online/tasse-e-contributi' },
  { source: 'external-unifg', url: 'https://www.unifg.it/it/studiare/corsi-di-laurea/immatricolazioni' },
  { source: 'external-unifg', url: 'https://www.unifg.it/it/studiare/corsi-di-laurea/manifesto-degli-studi' },
  { source: 'external-unifg', url: 'https://www.unifg.it/it/internazionale/parti-con-unifg/studio-outgoing' },
  { source: 'external-unifg', url: 'https://www.unifg.it/it/avvisi' },
  { source: 'external-unifg', url: 'https://www.unifg.it/it/servizi-e-opportunita/vita-universitaria/alloggi-e-mense' },
  // ADISU — URL formato /pagina{id}_{slug}.html; TLS via node:https (cert Actalis)
  { source: 'external-adisu', url: 'https://www.adisupuglia.it/pagina106703_borse-di-studio.html', insecure: true },
  { source: 'external-adisu', url: 'https://www.adisupuglia.it/pagina116497_alloggi.html', insecure: true },
  { source: 'external-adisu', url: 'https://www.adisupuglia.it/pagina116512_graduatorie.html', insecure: true },
  { source: 'external-adisu', url: 'https://www.adisupuglia.it/pagina22130_faq.html', insecure: true },
  // MUR — sezioni università e housing
  { source: 'external-mur', url: 'https://www.mur.gov.it/it/aree-tematiche/universita' },
  { source: 'external-mur', url: 'https://www.mur.gov.it/it/aree-tematiche/universita/mobilita-internazionale' },
  { source: 'external-mur', url: 'https://www.mur.gov.it/it/housing-universitario' },
  { source: 'external-mur', url: 'https://www.mur.gov.it/it/housing-universitario/avviso-housing' },
];

// Per ADISU (TLS incompleto): usa node:https con rejectUnauthorized:false
import * as https from 'node:https';

function checkUrlInsecure(url) {
  return new Promise((resolve) => {
    const u     = new URL(url);
    const timer = setTimeout(() => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); }, FETCH_TIMEOUT);
    const req   = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'HEAD', rejectUnauthorized: false, headers: { 'User-Agent': USER_AGENT } },
      (res) => {
        clearTimeout(timer);
        const loc = res.headers['location'];
        resolve({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode, redirected: !!(loc), finalUrl: loc ? new URL(loc, url).href : url });
      },
    );
    req.on('error', e => { clearTimeout(timer); resolve({ ok: false, status: 0, error: e.message }); });
    req.end();
  });
}

async function checkUrl(source, url, insecure = false) {
  if (insecure) return checkUrlInsecure(url);
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal:   ctrl.signal,
      method:   'HEAD',
      redirect: 'follow',
      headers:  { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timer);
    return { ok: res.ok || res.status === 405, status: res.status, redirected: res.redirected, finalUrl: res.url };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: e.message };
  }
}

const ROBOTS_CACHE = new Map();

function parseRobots(text) {
  const rules = { disallowed: [], allowed: [], crawlDelayMs: 1500 };
  let applicable = false;
  for (const rawLine of text.split('\n')) {
    const line  = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (field.toLowerCase() === 'user-agent') {
      applicable = value === '*' || value.toLowerCase().includes('arisbot');
      continue;
    }
    if (!applicable) continue;
    if (field.toLowerCase() === 'disallow' && value)    rules.disallowed.push(value);
    else if (field.toLowerCase() === 'allow' && value)  rules.allowed.push(value);
    else if (field.toLowerCase() === 'crawl-delay' && value) {
      const d = parseFloat(value);
      if (!isNaN(d)) rules.crawlDelayMs = Math.max(d * 1000, 1500);
    }
  }
  return rules;
}

async function loadRobots(baseUrl) {
  const key = new URL(baseUrl).origin;
  if (ROBOTS_CACHE.has(key)) return ROBOTS_CACHE.get(key);
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res   = await fetch(`${key}/robots.txt`, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT } });
    clearTimeout(timer);
    const text  = await res.text();
    const rules = parseRobots(text);
    ROBOTS_CACHE.set(key, { ok: true, rules, raw: text.slice(0, 500) });
    return ROBOTS_CACHE.get(key);
  } catch (e) {
    ROBOTS_CACHE.set(key, { ok: false, error: e.message });
    return ROBOTS_CACHE.get(key);
  }
}

function isAllowed(urlStr, rules) {
  let path;
  try { path = new URL(urlStr).pathname; } catch { return false; }
  for (const a of rules.allowed)    { if (path.startsWith(a)) return true; }
  for (const d of rules.disallowed) { if (d && path.startsWith(d)) return false; }
  return true;
}

console.log('\n  Recupero robots.txt e testo URL (può richiedere 30-60s)...\n');

// Load robots.txt for each domain
const DOMAINS = [...new Set(ALL_ENTRY_POINTS.map(e => new URL(e.url).origin))];
const robotsResults = {};
for (const domain of DOMAINS) {
  const r = await loadRobots(domain);
  robotsResults[domain] = r;
  if (r.ok) {
    const disallowCount = r.rules.disallowed.length;
    info(`robots.txt ${domain}: ${disallowCount} Disallow, crawl-delay=${r.rules.crawlDelayMs}ms`);
  } else {
    warn(`robots.txt ${domain}: non raggiungibile (${r.error ?? 'errore'})`);
  }
}

// Test each URL
const urlResults = { reachable: [], unreachable: [], blocked: [], redirected: [] };

for (const { source, url, insecure } of ALL_ENTRY_POINTS) {
  const res = await checkUrl(source, url, insecure ?? false);

  if (!res.ok) {
    urlResults.unreachable.push({ source, url, status: res.status, error: res.error });
    fail(`[${source}] ${url} → ${res.status || 'ERRORE'} (${res.error ?? 'unreachable'})`);
    continue;
  }

  // Check robots
  const domain = new URL(url).origin;
  const rData  = robotsResults[domain];
  if (rData?.ok) {
    const allowed = isAllowed(url, rData.rules);
    if (!allowed) {
      urlResults.blocked.push({ source, url });
      fail(`[${source}] ${url} → HTTP ${res.status} ma BLOCCATO da robots.txt`);
      continue;
    }
  }

  if (res.redirected && res.finalUrl !== url) {
    urlResults.redirected.push({ source, url, finalUrl: res.finalUrl, status: res.status });
    warn(`[${source}] ${url} → redirect a ${res.finalUrl} (${res.status})`);
  } else {
    urlResults.reachable.push({ source, url, status: res.status });
    pass(`[${source}] ${url} → ${res.status}`);
  }
}

// ── 6. CONTENT CHECK sulle pagine raggiungibili ───────────────────────────────

section('6. Content check — pagine raggiungibili');

const SAMPLE_URLS = urlResults.reachable.slice(0, 4);

for (const { source, url } of SAMPLE_URLS) {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res   = await fetch(url, {
      signal:  ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*;q=0.8' },
    });
    clearTimeout(timer);

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) {
      warn(`[${source}] ${url} → Content-Type non HTML: ${ct}`);
      continue;
    }

    const html    = await res.text();
    const titleM  = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title   = titleM?.[1]?.trim() ?? '(no title)';
    const textLen = html.replace(/<[^>]+>/g, ' ').trim().length;

    if (textLen > 500) {
      pass(`[${source}] "${title.slice(0, 50)}" — ${textLen} chars`);
    } else {
      warn(`[${source}] "${title.slice(0, 50)}" — contenuto molto corto (${textLen} chars)`);
    }
  } catch (e) {
    warn(`[${source}] ${url} — GET fallita: ${e.message}`);
  }
}

// ── 7. ENV VARS E SCRIPT SYNC ────────────────────────────────────────────────

section('7. Verifica env vars e script sync');

const missingEnv = [];
if (!process.env.PUBLIC_SUPABASE_URL)    missingEnv.push('PUBLIC_SUPABASE_URL');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY');
if (!process.env.OPENAI_API_KEY)         missingEnv.push('OPENAI_API_KEY');

if (missingEnv.length === 0) {
  pass('Tutte le env vars richieste sono presenti');
} else {
  warn(`Env vars mancanti localmente: ${missingEnv.join(', ')}`);
  info('La sync può essere eseguita via GitHub Action o Vercel Cron dove queste sono configurate');
  info('Per test locale: aggiungere le variabili al file .env');
}

// Verifica struttura vercel.json
import { readFileSync } from 'node:fs';
try {
  const vJson = JSON.parse(readFileSync('vercel.json', 'utf8'));
  if (vJson.crons?.length > 0) {
    const cron = vJson.crons[0];
    pass(`vercel.json cron configurato: ${cron.path} — schedule: "${cron.schedule}"`);
  } else {
    fail('vercel.json: nessun cron configurato');
  }
} catch {
  fail('vercel.json non trovato o non valido JSON');
}

// Verifica package.json scripts
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (pkg.scripts?.['aris:sync-external']) {
    pass(`package.json script: "aris:sync-external" → "${pkg.scripts['aris:sync-external']}"`);
  } else {
    fail('package.json: manca script "aris:sync-external"');
  }
} catch {
  fail('package.json non trovato');
}

// ── 8. TOOLS INDEX — ExternalOfficialSourcesTool registrato ──────────────────

section('8. Tool registration');

const toolsIndex = readFileSync('src/lib/aris/tools/index.ts', 'utf8');
if (toolsIndex.includes('ExternalOfficialSourcesTool')) {
  pass('ExternalOfficialSourcesTool importato in tools/index.ts');
} else {
  fail('ExternalOfficialSourcesTool NON trovato in tools/index.ts');
}

if (toolsIndex.includes("registry.register(new ExternalOfficialSourcesTool())")) {
  pass('ExternalOfficialSourcesTool registrato nel registry');
} else {
  fail('ExternalOfficialSourcesTool non registrato');
}

// Conta tool totali registrati
const registerCount = (toolsIndex.match(/registry\.register\(/g) ?? []).length;
if (registerCount === 9) {
  pass(`9 tool totali registrati`);
} else {
  warn(`${registerCount} tool registrati (atteso 9)`);
}

// ── 9. SQL MIGRATION ─────────────────────────────────────────────────────────

section('9. SQL Migration');

const sql = readFileSync('supabase/migrations/20240103000000_aris_external.sql', 'utf8');

const tables = ['aris_external_sources', 'aris_external_documents', 'aris_external_sync_logs'];
for (const t of tables) {
  if (sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`)) {
    pass(`Tabella ${t} definita`);
  } else {
    fail(`Tabella ${t} MANCANTE`);
  }
}

if (sql.includes('ENABLE ROW LEVEL SECURITY') && sql.match(/ENABLE ROW LEVEL SECURITY/g).length >= 3) {
  pass('RLS abilitato su tutte e 3 le tabelle');
} else {
  fail('RLS non abilitato su tutte le tabelle');
}

if (sql.includes("('external-unifg'") && sql.includes("('external-adisu'") && sql.includes("('external-mur'")) {
  pass('Seed 3 sorgenti presenti');
} else {
  fail('Seed sorgenti mancante');
}

if (sql.includes('content_hash text')) {
  pass('Campo content_hash presente in aris_external_documents');
} else {
  fail('Campo content_hash MANCANTE');
}

if (sql.includes('last_seen_at')) {
  pass('Campo last_seen_at presente');
} else {
  fail('Campo last_seen_at MANCANTE');
}

// ── 10. RESPONSE FORMAT CHECK ─────────────────────────────────────────────────

section('10. Response format — ExternalOfficialSourcesTool');

const toolSrc = readFileSync('src/lib/aris/tools/external-official-sources-tool.ts', 'utf8');

if (toolSrc.includes('formatLastSeen')) {
  pass('formatLastSeen() usato per freshness display');
} else {
  fail('formatLastSeen() non usato');
}

if (toolSrc.includes('**Fonte:**') && toolSrc.includes('**Aggiornato:**')) {
  pass('Template risposta include Fonte e Aggiornato');
} else {
  fail('Template risposta NON include Fonte/Aggiornato');
}

if (toolSrc.includes('[Leggi su sito ufficiale]')) {
  pass('Template risposta include URL fonte ufficiale');
} else {
  fail('Template risposta NON include URL');
}

if (toolSrc.includes('SOURCE_LABEL')) {
  pass('SOURCE_LABEL map per nome ente leggibile');
} else {
  fail('SOURCE_LABEL non trovato');
}

// ── RIEPILOGO FINALE ──────────────────────────────────────────────────────────

section('RIEPILOGO QA EXTERNAL SOURCES SYNC');

console.log(`
  ${PASS} PASS:  ${totalPass}
  ${FAIL} FAIL:  ${totalFail}
  ${WARN} WARN:  ${totalWarn}

  URL STATUS:
  ✅ Raggiungibili:   ${urlResults.reachable.length}/${ALL_ENTRY_POINTS.length}
  ❌ Non raggiungibili: ${urlResults.unreachable.length}
  ⚠️  Redirect:        ${urlResults.redirected.length}
  🚫 Bloccati robots:  ${urlResults.blocked.length}
`);

if (urlResults.unreachable.length > 0) {
  console.log('  URL non raggiungibili:');
  for (const u of urlResults.unreachable) {
    console.log(`    ❌ [${u.source}] ${u.url} — ${u.status} ${u.error ?? ''}`);
  }
}

if (urlResults.redirected.length > 0) {
  console.log('\n  URL con redirect:');
  for (const u of urlResults.redirected) {
    console.log(`    ⚠️  [${u.source}] ${u.url}\n       → ${u.finalUrl}`);
  }
}

if (urlResults.blocked.length > 0) {
  console.log('\n  URL bloccati da robots.txt:');
  for (const u of urlResults.blocked) {
    console.log(`    🚫 [${u.source}] ${u.url}`);
  }
}

if (missingEnv.length > 0) {
  console.log(`
  NOTA SYNC LIVE:
  Per eseguire la sync localmente aggiungere al .env:
  ${missingEnv.map(k => `  ${k}=<valore>`).join('\n  ')}

  In produzione (Vercel/GitHub Action) le variabili sono già configurate.
  Per testare subito: usare il GitHub Action con workflow_dispatch.
`);
}

if (totalFail > 0) process.exit(1);
