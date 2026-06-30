#!/usr/bin/env node
/**
 * Aris Live Test — simula domande reali degli studenti contro /api/chat
 *
 * Uso:  npm run aris:test-live
 * Env:  ARIS_TEST_BASE_URL  (default: http://localhost:4321)
 *       ARIS_TEST_DELAY_MS  (default: 1600 — rimane entro 15req/5min)
 *       ARIS_TEST_TIMEOUT   (default: 60000ms)
 *       ARIS_TEST_REPORT    (default: aris-test-report.md)
 *
 * Il server deve essere attivo prima di eseguire questo script.
 * NOTA: /api/chat ha rate limit 15 req/5min per IP.
 * Con delay ≥ 1600ms si rimane entro il limite senza pause.
 */

import { writeFileSync } from 'node:fs';

const BASE_URL    = process.env.ARIS_TEST_BASE_URL  ?? 'http://localhost:4321';
const DELAY_MS    = parseInt(process.env.ARIS_TEST_DELAY_MS  ?? '1600', 10);
const TIMEOUT_MS  = parseInt(process.env.ARIS_TEST_TIMEOUT   ?? '60000', 10);
const REPORT_FILE = process.env.ARIS_TEST_REPORT ?? 'aris-test-report.md';
const ENDPOINT    = `${BASE_URL}/api/chat`;

// Rate limit: 15 req / 5 min — su 429 aspetta window + buffer
const RL_WAIT_MS = 5 * 60 * 1000 + 15_000;

// ── Domande di test ────────────────────────────────────────────────────────────

const QUESTIONS = [
  // ── Area Nuova ───────────────────────────────────────────────────────────────
  { cat: 'Area Nuova', q: 'Chi è Area Nuova?' },
  { cat: 'Area Nuova', q: 'Cosa fa Area Nuova per gli studenti universitari?' },
  { cat: 'Area Nuova', q: 'Come posso contattare Area Nuova?' },
  { cat: 'Area Nuova', q: 'Dove si trova la sede di Area Nuova?' },
  { cat: 'Area Nuova', q: 'Quali progetti ha avviato Area Nuova?' },
  { cat: 'Area Nuova', q: 'Come posso diventare volontario o membro di Area Nuova?' },
  { cat: 'Area Nuova', q: 'Area Nuova organizza eventi per gli studenti?' },
  { cat: 'Area Nuova', q: 'Chi sono i rappresentanti studenteschi di Area Nuova?' },
  { cat: 'Area Nuova', q: 'Area Nuova ha una newsletter o canali social?' },
  { cat: 'Area Nuova', q: 'Come posso segnalare un problema ad Area Nuova?' },

  // ── Alloggi ──────────────────────────────────────────────────────────────────
  { cat: 'Alloggi', q: 'Cerco un appartamento a Foggia, ci sono disponibilità?' },
  { cat: 'Alloggi', q: 'Quanto costano le stanze per studenti a Foggia?' },
  { cat: 'Alloggi', q: 'Ci sono monolocali disponibili per studenti?' },
  { cat: 'Alloggi', q: 'Cerco un posto letto vicino all\'università di Foggia' },
  { cat: 'Alloggi', q: 'Appartamenti disponibili a meno di 400 euro al mese?' },
  { cat: 'Alloggi', q: 'Come funziona la piattaforma alloggi di Area Nuova?' },
  { cat: 'Alloggi', q: 'Stanze singole disponibili in zona centro a Foggia?' },
  { cat: 'Alloggi', q: 'Bilocali disponibili per due studenti con spese incluse?' },
  { cat: 'Alloggi', q: 'Come contatto un inserzionista per un alloggio?' },
  { cat: 'Alloggi', q: 'Ci sono posti letto disponibili da subito?' },

  // ── Convenzioni ──────────────────────────────────────────────────────────────
  { cat: 'Convenzioni', q: 'Quali convenzioni ha Area Nuova con i negozi di Foggia?' },
  { cat: 'Convenzioni', q: 'Come ottengo la Discount Card di Area Nuova?' },
  { cat: 'Convenzioni', q: 'Ci sono sconti per gli studenti nei ristoranti?' },
  { cat: 'Convenzioni', q: 'La Discount Card dà sconti in palestra?' },
  { cat: 'Convenzioni', q: 'Quali sono i negozi convenzionati con Area Nuova?' },
  { cat: 'Convenzioni', q: 'La Discount Card è gratuita per gli studenti?' },
  { cat: 'Convenzioni', q: 'Ci sono convenzioni con librerie o cartolerie?' },
  { cat: 'Convenzioni', q: 'Come si usa la Discount Card in un negozio convenzionato?' },
  { cat: 'Convenzioni', q: 'Quante convenzioni ha attualmente Area Nuova?' },
  { cat: 'Convenzioni', q: 'Ci sono convenzioni con studi dentistici o medici?' },

  // ── Gruppi WhatsApp ──────────────────────────────────────────────────────────
  { cat: 'Gruppi WhatsApp', q: 'Come entro nei gruppi WhatsApp per studenti universitari?' },
  { cat: 'Gruppi WhatsApp', q: 'Quali gruppi WhatsApp esistono per Giurisprudenza a UniFg?' },
  { cat: 'Gruppi WhatsApp', q: 'C\'è un gruppo WhatsApp per gli studenti di Medicina?' },
  { cat: 'Gruppi WhatsApp', q: 'Dove trovo il link al gruppo WhatsApp del mio corso di laurea?' },
  { cat: 'Gruppi WhatsApp', q: 'Esiste un gruppo WhatsApp per gli studenti fuorisede a Foggia?' },
  { cat: 'Gruppi WhatsApp', q: 'Ci sono gruppi WhatsApp per Economia e Commercio?' },
  { cat: 'Gruppi WhatsApp', q: 'Gruppi WhatsApp per studenti di Ingegneria a UniFg?' },
  { cat: 'Gruppi WhatsApp', q: 'Come funzionano i gruppi WhatsApp organizzati da Area Nuova?' },

  // ── Guide ────────────────────────────────────────────────────────────────────
  { cat: 'Guide', q: 'Come faccio l\'iscrizione agli esami su ESSE3?' },
  { cat: 'Guide', q: 'Come si richiede il certificato di iscrizione all\'università?' },
  { cat: 'Guide', q: 'Come si compila la dichiarazione ISEE per l\'università?' },
  { cat: 'Guide', q: 'Come si fa domanda di laurea su ESSE3?' },
  { cat: 'Guide', q: 'Come ottengo la mail istituzionale @unifg.it?' },
  { cat: 'Guide', q: 'Come si fa la candidatura per l\'Erasmus?' },
  { cat: 'Guide', q: 'Come si paga la terza rata delle tasse universitarie?' },
  { cat: 'Guide', q: 'Ho una disabilità: quali supporti offre l\'università di Foggia?' },

  // ── UniFg ────────────────────────────────────────────────────────────────────
  { cat: 'UniFg', q: 'Quando scadono le immatricolazioni all\'Università di Foggia?' },
  { cat: 'UniFg', q: 'Come funzionano le tasse universitarie a UniFg?' },
  { cat: 'UniFg', q: 'Dove si trova la segreteria studenti di UniFg?' },
  { cat: 'UniFg', q: 'Quando inizia l\'anno accademico 2025/2026 a Foggia?' },
  { cat: 'UniFg', q: 'Come si fa il trasferimento da un\'altra università a UniFg?' },
  { cat: 'UniFg', q: 'Quali corsi di laurea magistrale sono disponibili a UniFg?' },
  { cat: 'UniFg', q: 'Come funziona il programma Erasmus dell\'Università di Foggia?' },
  { cat: 'UniFg', q: 'Che cos\'è il manifesto degli studi di UniFg?' },

  // ── ADISU ────────────────────────────────────────────────────────────────────
  { cat: 'ADISU', q: 'Come si fa domanda per la borsa di studio ADISU?' },
  { cat: 'ADISU', q: 'Quando scadono i bandi ADISU per le borse di studio?' },
  { cat: 'ADISU', q: 'Quali sono i requisiti di reddito per la borsa ADISU?' },
  { cat: 'ADISU', q: 'Come funzionano gli alloggi gestiti da ADISU Puglia?' },
  { cat: 'ADISU', q: 'Dove si trova la mensa ADISU a Foggia?' },
  { cat: 'ADISU', q: 'Come posso controllare la mia posizione nella graduatoria ADISU?' },
  { cat: 'ADISU', q: 'Cos\'è il contributo straordinario ADISU e come richiederlo?' },
  { cat: 'ADISU', q: 'La borsa di studio ADISU è compatibile con un lavoro part-time?' },

  // ── MUR ──────────────────────────────────────────────────────────────────────
  { cat: 'MUR', q: 'Cosa dice il Ministero dell\'Università sull\'accesso programmato a Medicina?' },
  { cat: 'MUR', q: 'Il MUR ha bandi per dottorati di ricerca?' },
  { cat: 'MUR', q: 'Come funziona il housing universitario del MUR?' },
  { cat: 'MUR', q: 'Quali sono le università statali riconosciute dal MUR?' },
  { cat: 'MUR', q: 'Come funziona la mobilità internazionale secondo il MUR?' },

  // ── Medicina / Accesso programmato ───────────────────────────────────────────
  { cat: 'Medicina', q: 'Come funziona il test d\'ingresso per Medicina?' },
  { cat: 'Medicina', q: 'Quando si svolge il TOLC-MED per l\'accesso a Medicina?' },
  { cat: 'Medicina', q: 'Quanti posti ci sono nel corso di Medicina a UniFg?' },
  { cat: 'Medicina', q: 'Come mi preparo per il test di ammissione a Medicina?' },
  { cat: 'Medicina', q: 'È possibile trasferirsi al corso di Medicina da un altro ateneo?' },

  // ── Domande fuori ambito ──────────────────────────────────────────────────────
  { cat: 'Fuori ambito', q: 'Qual è la capitale della Francia?' },
  { cat: 'Fuori ambito', q: 'Raccontami una barzelletta' },
  { cat: 'Fuori ambito', q: 'Come funziona il motore a combustione interna?' },
  { cat: 'Fuori ambito', q: 'Puoi scrivere del codice Python per ordinare una lista?' },
  { cat: 'Fuori ambito', q: 'Qual è la ricetta originale della carbonara?' },
  { cat: 'Fuori ambito', q: 'Chi ha vinto il campionato mondiale di calcio 2022?' },
  { cat: 'Fuori ambito', q: 'Cosa pensi dell\'intelligenza artificiale in generale?' },
  { cat: 'Fuori ambito', q: 'Aiutami a scrivere una lettera di presentazione per un lavoro' },
];

// ── SSE parser ────────────────────────────────────────────────────────────────

async function callArisSSE(question) {
  const start = Date.now();
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method:  'POST',
      signal:  ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body:    JSON.stringify({ message: question, history: [] }),
    });

    if (res.status === 429) {
      clearTimeout(timer);
      return { rateLimited: true, elapsed: Date.now() - start };
    }

    if (!res.ok) {
      clearTimeout(timer);
      let errBody = '';
      try { errBody = await res.text(); } catch { /* ignore */ }
      return { error: `HTTP ${res.status}: ${errBody.slice(0, 100)}`, elapsed: Date.now() - start };
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';
    let   answer  = '';
    let   meta    = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { reader.cancel(); break; }

        try {
          const evt = JSON.parse(raw);
          if (evt.type === 'chunk')  answer += evt.content ?? '';
          if (evt.type === 'meta')   meta    = evt;
          if (evt.type === 'error')  {
            clearTimeout(timer);
            return { error: evt.message ?? 'SSE error', answer, elapsed: Date.now() - start };
          }
        } catch { /* invalid JSON line, skip */ }
      }
    }

    clearTimeout(timer);
    return {
      answer:       answer.trim(),
      tool:         meta?.tool         ?? inferTool(meta?.sources ?? []),
      confidence:   meta?.confidence   ?? null,
      affidabilita: meta?.affidabilita ?? 'non_trovata',
      sources:      meta?.sources      ?? [],
      elapsed:      Date.now() - start,
    };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg.includes('abort') ? 'TIMEOUT' : msg, elapsed: Date.now() - start };
  }
}

function inferTool(sources) {
  if (!sources?.length) return '(nessun tool)';
  const s = sources[0].source ?? '';
  const m = {
    'alloggi':          'alloggi',
    'guide':            'guide',
    'convenzioni':      'convenzioni',
    'gruppi-whatsapp':  'whatsapp',
    'news':             'news',
    'documenti':        'regolamenti',
    'external-unifg':   'external-official',
    'external-adisu':   'external-official',
    'external-mur':     'external-official',
  };
  return m[s] ?? 'rag';
}

// ── Report builder ────────────────────────────────────────────────────────────

function affidabilitaIcon(v) {
  if (v === 'alta')        return '🟢';
  if (v === 'media')       return '🟡';
  if (v === 'non_trovata') return '🔴';
  return '⚪';
}

function ms(n) {
  return n == null ? 'N/A' : `${(n / 1000).toFixed(2)}s`;
}

function escMd(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120);
}

function buildReport(results, generatedAt, durationSec) {
  const total   = results.length;
  const ok      = results.filter(r => !r.error && r.affidabilita !== 'non_trovata').length;
  const declined = results.filter(r => !r.error && r.affidabilita === 'non_trovata').length;
  const errors  = results.filter(r =>  r.error).length;
  const avgMs   = results.reduce((a, r) => a + (r.elapsed ?? 0), 0) / total;

  // Per categoria
  const cats = [...new Set(results.map(r => r.cat))];
  const catStats = cats.map(cat => {
    const rows = results.filter(r => r.cat === cat);
    const catOk = rows.filter(r => !r.error && r.affidabilita !== 'non_trovata').length;
    const catDecl = rows.filter(r => !r.error && r.affidabilita === 'non_trovata').length;
    const catErr = rows.filter(r => r.error).length;
    const catAvg = rows.reduce((a, r) => a + (r.elapsed ?? 0), 0) / rows.length;
    return { cat, total: rows.length, ok: catOk, declined: catDecl, errors: catErr, avgMs: catAvg };
  });

  // Tool frequency
  const toolCount = {};
  for (const r of results) {
    if (r.tool) toolCount[r.tool] = (toolCount[r.tool] ?? 0) + 1;
  }
  const toolRows = Object.entries(toolCount).sort((a, b) => b[1] - a[1]);

  let md = '';

  md += `# Aris Live Test Report\n\n`;
  md += `- **Generato:** ${generatedAt}\n`;
  md += `- **Base URL:** ${BASE_URL}\n`;
  md += `- **Durata totale:** ${durationSec.toFixed(1)}s\n`;
  md += `- **Domande testate:** ${total}\n`;
  md += `- **Risposte utili:** ${ok} (${((ok / total) * 100).toFixed(0)}%)\n`;
  md += `- **Rifiutate (fuori ambito / non trovate):** ${declined}\n`;
  md += `- **Errori:** ${errors}\n`;
  md += `- **Tempo medio risposta:** ${ms(avgMs)}\n\n`;

  md += `---\n\n## Riepilogo per categoria\n\n`;
  md += `| Categoria | Domande | ✅ OK | 🔴 Rifiutate | ❌ Errori | ⏱ Tempo medio |\n`;
  md += `|-----------|---------|-------|-------------|-----------|---------------|\n`;
  for (const s of catStats) {
    md += `| ${s.cat} | ${s.total} | ${s.ok} | ${s.declined} | ${s.errors} | ${ms(s.avgMs)} |\n`;
  }

  md += `\n---\n\n## Tool più usati\n\n`;
  md += `| Tool | # risposte |\n|------|------------|\n`;
  for (const [tool, count] of toolRows) {
    md += `| \`${tool}\` | ${count} |\n`;
  }

  md += `\n---\n\n## Risultati dettagliati\n\n`;

  for (const cat of cats) {
    md += `### ${cat}\n\n`;
    const rows = results.filter(r => r.cat === cat);

    for (const r of rows) {
      const icon = r.error ? '❌' : affidabilitaIcon(r.affidabilita);
      md += `#### ${icon} ${r.q}\n\n`;

      if (r.error) {
        md += `- **Errore:** \`${escMd(r.error)}\`\n`;
        md += `- **Tempo:** ${ms(r.elapsed)}\n\n`;
        continue;
      }

      md += `- **Tool:** \`${r.tool ?? '—'}\``;
      if (r.confidence != null) md += ` (confidence: ${r.confidence})`;
      md += '\n';
      md += `- **Affidabilità:** ${affidabilitaIcon(r.affidabilita)} ${r.affidabilita ?? '—'}\n`;
      md += `- **Tempo:** ${ms(r.elapsed)}\n`;

      if (r.sources?.length) {
        const src = r.sources.slice(0, 3).map(s => `[${escMd(s.titolo)}](${s.url ?? '#'})`).join(', ');
        md += `- **Fonti:** ${src}\n`;
      }

      if (r.answer) {
        // Prima riga significativa della risposta (max 300 chars)
        const preview = r.answer.replace(/\n+/g, ' ').trim().slice(0, 300);
        md += `\n> ${preview}${r.answer.length > 300 ? '…' : ''}\n`;
      }

      md += '\n';
    }
  }

  md += `---\n\n*Report generato da \`scripts/test-aris-live.mjs\`*\n`;
  return md;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function checkServer() {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    const res   = await fetch(BASE_URL, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(timer);
    return res.status < 600;
  } catch {
    return false;
  }
}

const generatedAt = new Date().toLocaleString('it-IT');
const startTotal  = Date.now();

console.log(`\n🤖 Aris Live Test — ${generatedAt}`);
console.log(`   Endpoint: ${ENDPOINT}`);
console.log(`   Domande:  ${QUESTIONS.length}`);
console.log(`   Delay:    ${DELAY_MS}ms tra richieste\n`);

// Verifica connettività
process.stdout.write('Verifica server... ');
const serverOk = await checkServer();
if (!serverOk) {
  console.error(`\n❌ Server non raggiungibile: ${BASE_URL}`);
  console.error('   Avvia il dev server con: npm run dev');
  console.error('   oppure imposta ARIS_TEST_BASE_URL con l\'URL di produzione');
  process.exit(1);
}
console.log('✅ online\n');

const results = [];
let   rlPauses = 0;

for (let i = 0; i < QUESTIONS.length; i++) {
  const { cat, q } = QUESTIONS[i];
  const progress = `[${String(i + 1).padStart(2)}/${QUESTIONS.length}]`;
  process.stdout.write(`${progress} ${q.slice(0, 55).padEnd(55)} `);

  let res;
  let attempts = 0;

  do {
    res = await callArisSSE(q);
    if (res.rateLimited) {
      attempts++;
      rlPauses++;
      const waitMin = Math.ceil(RL_WAIT_MS / 60000);
      process.stdout.write(`\n⏳ Rate limit — attendo ${waitMin} minuti (${rlPauses}° pausa)...`);
      await new Promise(r => setTimeout(r, RL_WAIT_MS));
      process.stdout.write(` ripresa.\n${progress} ${q.slice(0, 55).padEnd(55)} `);
    }
  } while (res.rateLimited && attempts < 3);

  if (res.rateLimited) {
    res = { error: 'Rate limit persistente — skip', elapsed: 0 };
  }

  const icon = res.error
    ? '❌'
    : res.affidabilita === 'alta'        ? '🟢'
    : res.affidabilita === 'media'       ? '🟡'
    : res.affidabilita === 'non_trovata' ? '🔴'
    : '⚪';

  const label = res.error
    ? `ERR: ${res.error.slice(0, 40)}`
    : `${res.affidabilita ?? '?'} | ${res.tool ?? '?'} | ${ms(res.elapsed)}`;

  console.log(`${icon} ${label}`);

  results.push({ cat, q, ...res });

  // Delay anti rate-limit (non sull'ultima domanda)
  if (i < QUESTIONS.length - 1 && !res.error) {
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

const durationSec = (Date.now() - startTotal) / 1000;

// Genera report
const report = buildReport(results, generatedAt, durationSec);
writeFileSync(REPORT_FILE, report, 'utf8');

// Statistiche finali
const ok       = results.filter(r => !r.error && r.affidabilita !== 'non_trovata').length;
const declined = results.filter(r => !r.error && r.affidabilita === 'non_trovata').length;
const errors   = results.filter(r =>  r.error).length;

console.log(`
${'─'.repeat(60)}
RISULTATI FINALI
${'─'.repeat(60)}
  ✅ Risposte utili:           ${ok}/${QUESTIONS.length} (${((ok / QUESTIONS.length) * 100).toFixed(0)}%)
  🔴 Rifiutate / non trovate: ${declined}
  ❌ Errori:                  ${errors}
  ⏳ Rate limit pauses:       ${rlPauses}
  ⏱  Durata totale:           ${durationSec.toFixed(1)}s
${'─'.repeat(60)}
📄 Report salvato: ${REPORT_FILE}
`);
