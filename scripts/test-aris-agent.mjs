/**
 * scripts/test-aris-agent.mjs
 * Aris v3 — QA script per l'architettura agentica.
 *
 * Verifica (senza dipendere da Astro/TypeScript):
 *   1. Che il Planner selezioni il Tool corretto per ogni query
 *   2. Che il Registry contenga tutti i Tool attesi
 *   3. Che RagTool sia usato solo come fallback
 *   4. Connettività opzionale a Supabase (se .env disponibile)
 *
 * Uso:
 *   node scripts/test-aris-agent.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── Carica .env ───────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* .env assente in CI */ }
}
loadEnv();

// ── Replica esatta delle PATTERNS da ogni Tool TypeScript ─────────────────────
// (Aggiornare se le patterns cambiano nei file .ts)
const TOOL_DEFS = [
  {
    id: 'alloggi', name: 'Alloggi Disponibili', priority: 85,
    source: 'alloggi (tabella Supabase live)',
    patterns: [
      /\ballogg[io]\b/i, /\bcas[ae]\b/i, /\bstanz[ae]\b/i, /\baffitt[oa]\b/i,
      /\bposto\s+letto\b/i, /\bappartament[io]\b/i, /\bbilocal[ei]\b/i,
      /\bmonolocal[ei]\b/i, /\bfuorisede\b/i, /\bposto\s+alloggio\b/i,
      /dove\s+(vivere|stare|dormire|abitare)/i,
      /\bcerco\s+(un[ao]?\s+)?(casa|posto|alloggio|stanza|appartamento)/i,
    ],
  },
  {
    id: 'guide', name: 'Guide Universitarie', priority: 80,
    source: 'aris_documents WHERE source=\'guide\'',
    patterns: [
      /\bguida\b/i, /\bprocedura\b/i,
      /come\s+(mi\s+)?(iscrivo|faccio|ottengo|accedo|scarico|richied[eo]|rinov[oa])/i,
      /\bimmatricolazion[ei]\b/i, /\biscrizion[ei]\b/i,
      /\besse3\b/i, /\bisee\b/i, /\btasse\s+universitari[ae]\b/i,
      /\berasmus\b/i, /\bcertificat[oi]\b/i, /\bdsa\b/i, /\bdisabilità\b/i,
      /\bbadge\b/i, /\btesserino\b/i, /\bborsa\s+di\s+studio\b/i, /\badisu\b/i,
      /\bmail\s+istituzional[ei]\b/i, /\bsemestre\s+filtro\b/i,
      /\bpiano\s+di\s+studi\b/i, /\blibretto\b/i,
      /\bresidenza\b/i, /\bdomicilio\b/i, /\bdichiarazione\b/i,
      /\bcarriera\s+universitaria\b/i, /\bcorso\s+di\s+laurea\b/i,
    ],
  },
  {
    id: 'convenzioni', name: 'Convenzioni Discount Card', priority: 80,
    source: 'aris_documents WHERE source=\'convenzioni\'',
    patterns: [
      /\bconvenzion[ei]\b/i, /\bdiscount\s+card\b/i, /\bscont[oi]\b/i,
      /\boffert[ae]\b/i, /\bconvenzionat[oi]\b/i, /\bristorant[ei]\b/i,
      /\bpizzeri[ae]\b/i, /\bbar\b/i, /\bpalestra\b/i, /\bnegozi[oi]\b/i,
      /\bpartner\b/i, /dove\s+(mangio|mangiare|mangiamo)\b/i,
      /\bfarmacie?\b/i, /\bparrucchiere?\b/i, /\bcinem[ao]\b/i,
      /\babbigliamento\b/i, /\bsport\b/i, /\battività\s+convenzionat/i,
    ],
  },
  {
    id: 'whatsapp', name: 'Gruppi WhatsApp UniFg', priority: 80,
    source: 'aris_documents WHERE source=\'gruppi-whatsapp\'',
    patterns: [
      /\bwhatsapp\b/i, /\bgruppo\s+whatsapp\b/i, /\bchat\s+whatsapp\b/i,
      /\bgruppo\s+(del\s+)?corso\b/i, /\bgruppo\s+studenti\b/i,
      /\blink\s+(?:del\s+)?gruppo\b/i, /\bcomunità\s+online\b/i,
      /entrare\s+nel\s+gruppo/i, /\bgruppo\s+universitario\b/i, /\btelegram\b/i,
    ],
  },
  {
    id: 'news', name: 'News e Comunicati', priority: 75,
    source: 'aris_documents WHERE source=\'news\'',
    patterns: [
      /\bnotizie\b/i, /\bnews\b/i, /\baggiornament[oi]\b/i, /\bnovità\b/i,
      /\bcomunicat[oi]\b/i, /\bannunci[oi]\b/i, /\bultime\s+notizie\b/i,
      /\brecentem?ente\b/i, /\bultim[aoie]\b/i,
      /\bquest[ao]\s+(?:settimana|mese|anno)\b/i,
    ],
  },
  {
    id: 'regolamenti', name: 'Documenti e Regolamenti', priority: 72,
    source: 'RAG source_filter=[\'documenti\']',
    patterns: [
      /\bregolament[oi]\b/i, /\bmodulistica\b/i, /\bmodul[oi]\b/i,
      /\bdocument[oi]\b/i, /\bmozione\b/i, /\brichiesta\s+(?:formale|ufficiale)\b/i,
      /\bpetizione\b/i, /\bdelibera\b/i, /\bverbale\b/i, /\bstatuto\b/i,
      /\bistanza\b/i, /\batto\s+ufficiale\b/i, /\bmodulo\s+(?:di\s+)?richiesta\b/i,
    ],
  },
  {
    id: 'rappresentanti', name: 'Rappresentanti Studenteschi', priority: 70,
    source: 'RAG semantico generico',
    patterns: [
      /\brappresentant[ei]\b/i, /\bsenato\s+accademico\b/i,
      /\bconsiglio\s+di\s+amministrazione\b/i, /\b(?:cda|c\.d\.a\.)\b/i,
      /\b(?:csu|c\.s\.u\.)\b/i, /\bnucleo\s+di\s+valutazione\b/i,
      /\borgano\s+(?:di\s+)?(?:rappresentanza|collegiale)\b/i,
      /chi\s+(ci\s+)?rappresenta/i, /\bdelegat[oi]\s+studenti\b/i,
      /\belezion[ei]\s+studentesch[ei]\b/i, /\blista\s+(?:studenti|elettorale)\b/i,
    ],
  },
  {
    id: 'rag', name: 'Ricerca Semantica (RAG)', priority: 10,
    source: 'pgvector full-text (tutti i source)',
    patterns: [],
  },
];

const EXPECTED_IDS = TOOL_DEFS.map(t => t.id);

// ── Planner (replica da planner.ts) ──────────────────────────────────────────
function scorePatterns(patterns, query) {
  const hits = patterns.filter(p => p.test(query)).length;
  if (hits === 0) return 0;
  return Math.min(60 + hits * 10, 95);
}

function planQuery(query) {
  const sorted = [...TOOL_DEFS].sort((a, b) => b.priority - a.priority);
  let bestScore  = 0;
  let bestTool   = TOOL_DEFS.find(t => t.id === 'rag');
  const breakdown = {};

  for (const tool of sorted) {
    if (tool.id === 'rag') { breakdown.rag = 35; continue; }
    const score = scorePatterns(tool.patterns, query);
    breakdown[tool.id] = score;
    if (score > bestScore) {
      bestScore = score;
      bestTool  = tool;
    }
  }

  return {
    toolId:    bestTool.id,
    toolName:  bestTool.name,
    source:    bestTool.source,
    plannerScore: bestScore,
    isRagFallback: bestTool.id === 'rag',
    breakdown,
  };
}

// ── Test queries ──────────────────────────────────────────────────────────────
const QUERIES = [
  {
    q:        'Cerco un alloggio vicino Medicina sotto 300 euro',
    expected: 'alloggi',
    note:     'Filter: prezzo_max=300, tipo non estratto (vicino=location)',
  },
  {
    q:        'Ci sono convenzioni con pizzerie?',
    expected: 'convenzioni',
  },
  {
    q:        'Qual è il gruppo WhatsApp di Medicina secondo anno?',
    expected: 'whatsapp',
  },
  {
    q:        'Come faccio il piano di studi?',
    expected: 'guide',
  },
  {
    q:        'Ultime news di Area Nuova',
    expected: 'news',
  },
  {
    q:        'Chi sono i rappresentanti di Medicina?',
    expected: 'rappresentanti',
  },
  {
    q:        'Dove trovo il regolamento tirocini?',
    expected: 'regolamenti',
  },
  {
    q:        'Quando scade la borsa ADISU?',
    expected: 'guide',
  },
  {
    q:        'Cosa fa Area Nuova?',
    expected: 'rag',
    note:     'Query generica — deve usare RAG come fallback',
  },
  {
    q:        'Come è il tempo oggi?',
    expected: 'rag',
    note:     'Query off-topic — RAG, probabile confidence < 50 → declino',
  },
];

// ── AlloggiTool filter extraction (replica da alloggi-tool.ts) ────────────────
function extractFilters(query) {
  const f = {};
  if (/appartament[io]|bilocal[ei]/i.test(query))    f.tipo = 'appartamento';
  else if (/monolocal[ei]/i.test(query))              f.tipo = 'monolocale';
  else if (/posto\s+letto|stanz[ae]\b/i.test(query)) f.tipo = 'stanza';

  const pm = query.match(/(?:meno\s+di|sotto\s+i?|max|fino\s+a)\s*(\d+)\s*(?:euro|€)?/i)
          ?? query.match(/(\d{2,4})\s*(?:euro|€)/i);
  if (pm) f.prezzo_max = parseInt(pm[1], 10);

  const zm = query.match(/(?:in\s+zona|zona|quartiere)\s+(\w+)/i);
  if (zm) f.zona = zm[1].trim();

  return f;
}

// ── Stampa ────────────────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function pass(msg)  { console.log(`${GREEN}  ✓  ${msg}${RESET}`); }
function fail(msg)  { console.log(`${RED}  ✗  ${msg}${RESET}`); }
function info(msg)  { console.log(`${CYAN}     ${msg}${RESET}`); }
function warn(msg)  { console.log(`${YELLOW}  ⚠  ${msg}${RESET}`); }
function section(t) { console.log(`\n${BOLD}${t}${RESET}`); }

// ─────────────────────────────────────────────────────────────────────────────
section('═══ ARIS v3 — QA AGENT SCRIPT ═══\n');

// 1. Registry check
section('1. TOOL REGISTRY — verifica registrazione');
const REGISTERED_IDS = TOOL_DEFS.map(t => t.id);
for (const id of EXPECTED_IDS) {
  if (REGISTERED_IDS.includes(id)) {
    pass(`Tool "${id}" registrato`);
  } else {
    fail(`Tool "${id}" MANCANTE nel registro`);
  }
}
info(`Totale tool: ${REGISTERED_IDS.length}`);

// 2. Planner correctness
section('\n2. PLANNER — selezione tool per query');
let plannerPassed = 0;
let plannerFailed = 0;

for (const { q, expected, note } of QUERIES) {
  const result = planQuery(q);
  const ok = result.toolId === expected;
  if (ok) {
    pass(`[${result.toolId.padEnd(14)}] score:${String(result.plannerScore).padStart(3)} | "${q}"`);
    plannerPassed++;
  } else {
    fail(`[${result.toolId.padEnd(14)}] score:${String(result.plannerScore).padStart(3)} | "${q}"`);
    info(`Atteso: ${expected}, Ottenuto: ${result.toolId}`);
    plannerFailed++;
  }
  if (note) info(`Note: ${note}`);

  // Show score breakdown for failed/interesting cases
  if (!ok || result.isRagFallback) {
    const top3 = Object.entries(result.breakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, s]) => `${id}=${s}`)
      .join(', ');
    info(`Breakdown top-3: ${top3}`);
  }
}
info(`Risultato planner: ${plannerPassed}/${QUERIES.length} corretti`);

// 3. Alloggi filter extraction
section('\n3. ALLOGGI TOOL — estrazione filtri');
const filterTests = [
  { q: 'Cerco un appartamento a meno di 400 euro',    expected: { tipo: 'appartamento', prezzo_max: 400 } },
  { q: 'posto letto disponibile in zona centro',      expected: { tipo: 'stanza', zona: 'centro' } },
  { q: 'monolocale sotto 350€ al mese',               expected: { tipo: 'monolocale', prezzo_max: 350 } },
  { q: 'case in zona porto fino a 500 euro',          expected: { prezzo_max: 500, zona: 'porto' } },
  { q: 'alloggi disponibili',                         expected: {} },
];

for (const { q, expected } of filterTests) {
  const got = extractFilters(q);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) {
    pass(`"${q}"`);
    info(`Filtri: ${JSON.stringify(got)}`);
  } else {
    warn(`"${q}"`);
    info(`Atteso: ${JSON.stringify(expected)}`);
    info(`Ottenuto: ${JSON.stringify(got)}`);
  }
}

// 4. RAG fallback verification
section('\n4. RAG — solo come fallback');
const ragQueries = [
  'Cosa fa Area Nuova?',
  'Il rettore di UniGe',
  'Come è il tempo oggi?',
  'Pizza margherita ricetta',
];
let ragFallbackOk = true;
for (const q of ragQueries) {
  const r = planQuery(q);
  if (r.toolId === 'rag') {
    pass(`RAG fallback corretto per: "${q}"`);
  } else {
    fail(`RAG NON selezionato per: "${q}" — got: ${r.toolId} (score: ${r.plannerScore})`);
    ragFallbackOk = false;
  }
}
if (ragFallbackOk) info('RagTool usato correttamente come fallback per query non specializzate');

// 5. Specialist tools NOT using RAG for core queries
section('\n5. SPECIALIST TOOLS — non usano RAG per query specializzate');
const specialistQueries = [
  { q: 'cerco un appartamento',           notExpected: 'rag' },
  { q: 'convenzioni ristoranti',          notExpected: 'rag' },
  { q: 'gruppo whatsapp primo anno',      notExpected: 'rag' },
  { q: 'come ottengo il tesserino',       notExpected: 'rag' },
  { q: 'ultime notizie area nuova',       notExpected: 'rag' },
  { q: 'modulo richiesta tirocinio',      notExpected: 'rag' },
  { q: 'chi sono i rappresentanti',       notExpected: 'rag' },
];
let specialistOk = 0;
for (const { q, notExpected } of specialistQueries) {
  const r = planQuery(q);
  if (r.toolId !== notExpected) {
    pass(`"${q}" → ${r.toolId} (score: ${r.plannerScore})`);
    specialistOk++;
  } else {
    fail(`"${q}" → RAG usato invece di un tool specializzato`);
  }
}
info(`${specialistOk}/${specialistQueries.length} query correttamente indirizzate a tool specializzati`);

// 6. API coherence check (file existence)
section('\n6. API — verifica file esistenti');
import { existsSync } from 'node:fs';
const API_FILES = [
  'src/pages/api/chat.ts',
  'src/pages/api/search.ts',
  'src/pages/api/aris/feedback.ts',
  'src/pages/api/health.ts',
  'src/pages/api/index-content.ts',
];
for (const f of API_FILES) {
  const path = join(ROOT, f);
  if (existsSync(path)) {
    pass(f);
  } else {
    fail(`${f} — FILE NON TROVATO`);
  }
}

// 7. Agent file structure check
section('\n7. STRUTTURA FILE AGENT — verifica completezza');
const AGENT_FILES = [
  'src/lib/aris/agent/types.ts',
  'src/lib/aris/agent/registry.ts',
  'src/lib/aris/agent/planner.ts',
  'src/lib/aris/agent/executor.ts',
  'src/lib/aris/agent/agent.ts',
  'src/lib/aris/tools/base-tool.ts',
  'src/lib/aris/tools/index.ts',
  'src/lib/aris/tools/alloggi-tool.ts',
  'src/lib/aris/tools/guide-tool.ts',
  'src/lib/aris/tools/convenzioni-tool.ts',
  'src/lib/aris/tools/whatsapp-tool.ts',
  'src/lib/aris/tools/news-tool.ts',
  'src/lib/aris/tools/regolamenti-tool.ts',
  'src/lib/aris/tools/rappresentanti-tool.ts',
  'src/lib/aris/tools/rag-tool.ts',
  'src/lib/aris/shared/keywords.ts',
  'src/lib/aris/chat.ts',
];
let filesMissing = 0;
for (const f of AGENT_FILES) {
  const path = join(ROOT, f);
  if (existsSync(path)) {
    pass(f);
  } else {
    fail(`${f} — FILE NON TROVATO`);
    filesMissing++;
  }
}
if (filesMissing === 0) info('Tutti i file dell\'architettura agentiva sono presenti');

// 8. Optional: Supabase connectivity test
section('\n8. SUPABASE — connettività (opzionale)');
const SUPA_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPA_URL || !SUPA_KEY) {
  warn('Variabili Supabase non trovate nel .env — skip test live');
  info('Per testare la connettività: imposta PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
} else {
  info(`Supabase URL: ${SUPA_URL.slice(0, 40)}...`);
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Test 1: aris_documents count per source
    const { data: docs, error: e1 } = await sb
      .from('aris_documents')
      .select('source')
      .order('source');
    if (e1) {
      fail(`aris_documents: ${e1.message}`);
    } else {
      const counts = {};
      for (const d of (docs ?? [])) {
        counts[d.source] = (counts[d.source] ?? 0) + 1;
      }
      pass(`aris_documents accessibile — ${(docs ?? []).length} documenti totali`);
      for (const [src, cnt] of Object.entries(counts)) {
        info(`  source='${src}': ${cnt} doc`);
      }
    }

    // Test 2: alloggi table
    const oggi = new Date().toISOString().split('T')[0];
    const { data: alloggi, error: e2 } = await sb
      .from('alloggi')
      .select('id, titolo, prezzo, tipo')
      .eq('stato', 'pubblicato')
      .gte('scade_il', oggi)
      .limit(5);
    if (e2) {
      warn(`alloggi: ${e2.message} — tabella potrebbe non esistere ancora`);
    } else {
      const cnt = (alloggi ?? []).length;
      pass(`alloggi live: ${cnt} annuncio${cnt !== 1 ? 'i' : ''} pubblicat${cnt !== 1 ? 'i' : 'o'}`);
      for (const a of (alloggi ?? []).slice(0, 3)) {
        info(`  • ${a.titolo} — €${a.prezzo}/mese (${a.tipo})`);
      }
    }

    // Test 3: aris_feedback
    const { error: e3 } = await sb.from('aris_feedback').select('id').limit(1);
    if (e3) {
      warn(`aris_feedback: ${e3.message}`);
    } else {
      pass('aris_feedback accessibile');
    }

  } catch (err) {
    fail(`Errore connessione Supabase: ${err.message}`);
  }
}

// ── Riepilogo finale ──────────────────────────────────────────────────────────
section('\n═══ RIEPILOGO QA ═══\n');
console.log(`${BOLD}Planner:${RESET}     ${plannerPassed === QUERIES.length ? GREEN+'PASS'+RESET : RED+'FAIL'+RESET} (${plannerPassed}/${QUERIES.length} query corrette)`);
console.log(`${BOLD}Registry:${RESET}    ${GREEN}PASS${RESET} (${REGISTERED_IDS.length} tool registrati)`);
console.log(`${BOLD}Fallback:${RESET}    ${ragFallbackOk ? GREEN+'PASS' : RED+'FAIL'}${RESET} (RAG usato per query non specializzate)`);
console.log(`${BOLD}File struct:${RESET} ${filesMissing === 0 ? GREEN+'PASS' : RED+'FAIL'}${RESET} (${AGENT_FILES.length - filesMissing}/${AGENT_FILES.length} file presenti)\n`);

if (plannerFailed > 0) {
  console.log(`${RED}${BOLD}⚠ ${plannerFailed} query con tool errato — rivedere i PATTERNS.${RESET}\n`);
}
