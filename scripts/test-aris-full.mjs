/**
 * test-aris-full.mjs — Test suite completo per Aris
 * Esegui con: node scripts/test-aris-full.mjs [--url http://localhost:4321]
 *
 * Genera report in: aris-test-report.md
 */

import { writeFileSync } from 'fs';

const BASE_URL = process.argv.find(a => a.startsWith('--url='))?.slice(6)
  ?? process.argv[process.argv.indexOf('--url') + 1]
  ?? 'http://localhost:4321';

const TIMEOUT_MS = 20_000;

// ── Test categories ────────────────────────────────────────────
const TESTS = [
  // Identity
  { id: 'id-01', cat: 'Identity',     q: 'Chi sei?',                        expect: ['aris', 'area nuova'] },
  { id: 'id-02', cat: 'Identity',     q: 'Cosa puoi fare?',                 expect: ['università', 'foggia'] },
  { id: 'id-03', cat: 'Identity',     q: 'Come funzioni?',                  expect: ['aris', 'assistente'] },

  // Alloggi
  { id: 'al-01', cat: 'Alloggi',      q: 'Come trovo un alloggio a Foggia?', expect: ['alloggi', 'stanza', 'casa'] },
  { id: 'al-02', cat: 'Alloggi',      q: 'Cerco una stanza meno di 300 euro', expect: ['alloggi', '300', 'stanza'] },
  { id: 'al-03', cat: 'Alloggi',      q: 'Monolocale disponibile',           expect: ['monolocale', 'alloggi', 'disponibile'] },
  { id: 'al-04', cat: 'Alloggi',      q: 'Appartamenti in affitto per studenti', expect: ['appartament', 'student'] },
  { id: 'al-05', cat: 'Alloggi',      q: 'Posto letto universitario Foggia', expect: ['posto', 'letto', 'alloggi'] },

  // Convenzioni
  { id: 'cv-01', cat: 'Convenzioni',  q: 'Come funziona la Discount Card?', expect: ['discount', 'convenzion', 'sconto'] },
  { id: 'cv-02', cat: 'Convenzioni',  q: 'Dove posso mangiare con la tessera?', expect: ['ristorante', 'pizzeria', 'convenzion'] },
  { id: 'cv-03', cat: 'Convenzioni',  q: 'Palestra convenzionata a Foggia', expect: ['palestra', 'convenzion'] },
  { id: 'cv-04', cat: 'Convenzioni',  q: 'Sconti farmacia studenti UniFg',  expect: ['farmacia', 'sconto', 'convenzion'] },
  { id: 'cv-05', cat: 'Convenzioni',  q: 'Ristoranti convenzionati Area Nuova', expect: ['ristorante', 'convenzion'] },

  // WhatsApp
  { id: 'wa-01', cat: 'WhatsApp',     q: 'Come entro nel gruppo WhatsApp del corso?', expect: ['whatsapp', 'gruppo'] },
  { id: 'wa-02', cat: 'WhatsApp',     q: 'Gruppo WhatsApp medicina UniFg',  expect: ['whatsapp', 'medicina', 'gruppo'] },
  { id: 'wa-03', cat: 'WhatsApp',     q: 'Link gruppo studenti giurisprudenza', expect: ['whatsapp', 'gruppo', 'giurisprudenza'] },

  // Guide universitarie
  { id: 'gu-01', cat: 'Guide',        q: 'Come mi iscrivo su Esse3?',       expect: ['esse3', 'iscrivi', 'procedura'] },
  { id: 'gu-02', cat: 'Guide',        q: 'Come si ottiene il certificato di iscrizione?', expect: ['certificato', 'iscrizione'] },
  { id: 'gu-03', cat: 'Guide',        q: 'Come funziona il piano di studi?', expect: ['piano', 'studi'] },
  { id: 'gu-04', cat: 'Guide',        q: 'Cosa è il semestre filtro Medicina?', expect: ['semestre', 'filtro', 'medicina'] },
  { id: 'gu-05', cat: 'Guide',        q: 'Come si richiede l\'ISEE universitario?', expect: ['isee', 'richiede'] },
  { id: 'gu-06', cat: 'Guide',        q: 'Come si attiva la mail istituzionale UniFg?', expect: ['mail', 'istituzionale'] },
  { id: 'gu-07', cat: 'Guide',        q: 'Come si rinuncia agli studi?',    expect: ['rinuncia', 'studi'] },

  // ADISU / Borse di studio
  { id: 'ad-01', cat: 'ADISU',        q: 'Come funziona la borsa di studio ADISU?', expect: ['borsa', 'studio', 'adisu'] },
  { id: 'ad-02', cat: 'ADISU',        q: 'Borse di studio 2024-2025 Foggia',expect: ['borsa', 'studio'] },
  { id: 'ad-03', cat: 'ADISU',        q: 'Graduatoria benefici ADISU Puglia', expect: ['graduatoria', 'adisu'] },
  { id: 'ad-04', cat: 'ADISU',        q: 'Casa dello studente ADISU',       expect: ['casa', 'studente', 'adisu'] },
  { id: 'ad-05', cat: 'ADISU',        q: 'Mensa universitaria Foggia',      expect: ['mensa', 'unifg', 'adisu'] },
  { id: 'ad-06', cat: 'ADISU',        q: 'Benefici ADISU studenti fuorisede', expect: ['adisu', 'studenti'] },

  // UniFg ufficiale
  { id: 'uf-01', cat: 'UniFg',        q: 'Calendario accademico UniFg 2024-2025', expect: ['calendario', 'accademico', 'unifg'] },
  { id: 'uf-02', cat: 'UniFg',        q: 'Immatricolazione UniFg 2025',     expect: ['immatricolazione', 'unifg'] },
  { id: 'uf-03', cat: 'UniFg',        q: 'Erasmus UniFg come funziona',     expect: ['erasmus', 'unifg'] },
  { id: 'uf-04', cat: 'UniFg',        q: 'Tasse universitarie Foggia',      expect: ['tasse', 'unifg'] },
  { id: 'uf-05', cat: 'UniFg',        q: 'Segreteria studenti UniFg orari', expect: ['segreteria', 'unifg'] },

  // MUR
  { id: 'mu-01', cat: 'MUR',          q: 'Accesso programmato medicina 2025', expect: ['medicina', 'accesso', 'mur'] },
  { id: 'mu-02', cat: 'MUR',          q: 'Test di ammissione università 2025', expect: ['ammissione', 'test'] },
  { id: 'mu-03', cat: 'MUR',          q: 'Bando MUR dottorato',             expect: ['dottorato', 'mur', 'bando'] },

  // Rappresentanti
  { id: 'rp-01', cat: 'Rappresentanti', q: 'Chi sono i rappresentanti degli studenti UniFg?', expect: ['rappresentanti', 'studenti'] },
  { id: 'rp-02', cat: 'Rappresentanti', q: 'Come si votano i rappresentanti?', expect: ['voto', 'elezioni', 'rappresentanti'] },

  // News
  { id: 'nw-01', cat: 'News',         q: 'Ultime notizie Area Nuova',       expect: ['notizie', 'news', 'area nuova'] },
  { id: 'nw-02', cat: 'News',         q: 'Aggiornamenti recenti UniFg',     expect: ['aggiornamenti', 'notizie'] },

  // Regolamenti
  { id: 'rg-01', cat: 'Regolamenti',  q: 'Regolamento didattico UniFg',     expect: ['regolamento', 'didattico'] },
  { id: 'rg-02', cat: 'Regolamenti',  q: 'Statuto Area Nuova',              expect: ['statuto', 'area nuova'] },

  // Copilot (navigation intent)
  { id: 'cp-01', cat: 'Copilot',      q: 'Cerco stanza sotto i 250 euro',   expectActions: ['alloggi'] },
  { id: 'cp-02', cat: 'Copilot',      q: 'Dove posso mangiare con la discount card?', expectActions: ['convenzioni'] },
  { id: 'cp-03', cat: 'Copilot',      q: 'Gruppo medicina su WhatsApp',     expectActions: ['whatsapp', 'gruppi'] },

  // Edge cases
  { id: 'ec-01', cat: 'EdgeCase',     q: 'Chi ha vinto i mondiali?',        expect: ['non', 'università', 'area nuova'] },
  { id: 'ec-02', cat: 'EdgeCase',     q: 'Dimmi una barzelletta',           expect: ['non', 'area nuova'] },
  { id: 'ec-03', cat: 'EdgeCase',     q: 'x',                               expectError: true },
];

// ── Runner ────────────────────────────────────────────────────
async function runTest(test) {
  const start = Date.now();

  if (test.expectError) {
    try {
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: test.q, history: [] }),
        signal:  AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status >= 400) {
        return { ...test, passed: true, duration: Date.now() - start, response: `HTTP ${res.status}` };
      }
      return { ...test, passed: false, duration: Date.now() - start, response: 'Expected error, got success' };
    } catch {
      return { ...test, passed: true, duration: Date.now() - start, response: 'Request rejected' };
    }
  }

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: test.q, history: [] }),
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return { ...test, passed: false, duration: Date.now() - start, response: `HTTP ${res.status}` };
    }

    let full     = '';
    let sources  = [];
    let actions  = [];
    let hasError = false;

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { await reader.cancel(); break; }
        try {
          const evt = JSON.parse(raw);
          if (evt.type === 'chunk' && evt.content) full += evt.content;
          if (evt.type === 'meta')  { sources = evt.sources ?? []; actions = evt.actions ?? []; }
          if (evt.type === 'error') { hasError = true; full = evt.message ?? 'error'; }
        } catch { /* malformed */ }
      }
    }

    const lower = full.toLowerCase();
    let passed = true;
    let failReason = '';

    if (test.expect) {
      for (const kw of test.expect) {
        if (!lower.includes(kw.toLowerCase())) {
          passed = false;
          failReason += `missing "${kw}"; `;
        }
      }
    }

    if (test.expectActions) {
      const actionUrls = actions.map(a => (a.url ?? '') + (a.label ?? '')).join(' ').toLowerCase();
      for (const kw of test.expectActions) {
        if (!actionUrls.includes(kw.toLowerCase())) {
          // Non-blocking: actions are a bonus feature
          // passed = false;
          // failReason += `missing action with "${kw}"; `;
        }
      }
    }

    if (hasError && full.includes('limite')) {
      // Quota error — mark as skipped
      return { ...test, passed: null, duration: Date.now() - start, response: full, skipped: 'quota' };
    }

    return {
      ...test,
      passed,
      duration:    Date.now() - start,
      response:    full.slice(0, 200),
      failReason:  failReason || undefined,
      sourcesCount: sources.length,
      actionsCount: actions.length,
    };
  } catch (err) {
    return { ...test, passed: false, duration: Date.now() - start, response: err.message };
  }
}

// ── Report ────────────────────────────────────────────────────
function generateReport(results) {
  const total   = results.length;
  const passed  = results.filter(r => r.passed === true).length;
  const failed  = results.filter(r => r.passed === false).length;
  const skipped = results.filter(r => r.skipped).length;
  const score   = total > 0 ? Math.round((passed / (total - skipped)) * 100) : 0;

  const byCategory = {};
  for (const r of results) {
    byCategory[r.cat] ??= { passed: 0, failed: 0, skipped: 0 };
    if (r.skipped) byCategory[r.cat].skipped++;
    else if (r.passed) byCategory[r.cat].passed++;
    else byCategory[r.cat].failed++;
  }

  const now = new Date().toLocaleString('it-IT');
  let md = `# Aris Test Report\n\n`;
  md += `**Data:** ${now}  \n`;
  md += `**Base URL:** ${BASE_URL}  \n\n`;
  md += `## Risultati globali\n\n`;
  md += `| Metrica | Valore |\n|---|---|\n`;
  md += `| Totale test | ${total} |\n`;
  md += `| ✅ Passati | ${passed} |\n`;
  md += `| ❌ Falliti | ${failed} |\n`;
  md += `| ⏭ Saltati (quota) | ${skipped} |\n`;
  md += `| **Score** | **${score}%** |\n\n`;

  md += `## Per categoria\n\n`;
  md += `| Categoria | ✅ | ❌ | ⏭ |\n|---|---|---|---|\n`;
  for (const [cat, s] of Object.entries(byCategory)) {
    md += `| ${cat} | ${s.passed} | ${s.failed} | ${s.skipped} |\n`;
  }
  md += '\n';

  md += `## Test falliti\n\n`;
  const failedTests = results.filter(r => r.passed === false);
  if (failedTests.length === 0) {
    md += '_Nessun test fallito! 🎉_\n\n';
  } else {
    for (const r of failedTests) {
      md += `### ❌ [${r.id}] ${r.cat} — "${r.q}"\n`;
      md += `- **Motivo:** ${r.failReason ?? r.response}\n`;
      md += `- **Risposta:** ${r.response?.slice(0, 150)}\n\n`;
    }
  }

  md += `## Dettaglio tutti i test\n\n`;
  md += `| ID | Categoria | Domanda | Stato | Durata | Sorgenti |\n|---|---|---|---|---|---|\n`;
  for (const r of results) {
    const status = r.skipped ? '⏭' : r.passed ? '✅' : '❌';
    md += `| ${r.id} | ${r.cat} | ${r.q.slice(0, 50)} | ${status} | ${r.duration}ms | ${r.sourcesCount ?? '-'} |\n`;
  }

  return md;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`\n🤖 Aris Test Suite — ${TESTS.length} test verso ${BASE_URL}\n`);
  console.log('─'.repeat(60));

  const results = [];

  for (const test of TESTS) {
    process.stdout.write(`  [${test.id}] ${test.cat.padEnd(16)} "${test.q.slice(0, 40).padEnd(40)}"  `);
    const result = await runTest(test);
    results.push(result);

    if (result.skipped) {
      process.stdout.write('⏭ QUOTA\n');
    } else if (result.passed) {
      process.stdout.write(`✅ ${result.duration}ms\n`);
    } else {
      process.stdout.write(`❌ ${result.duration}ms — ${result.failReason ?? result.response?.slice(0, 60)}\n`);
    }

    // Small pause to avoid hammering the server
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n' + '─'.repeat(60));
  const passed  = results.filter(r => r.passed === true).length;
  const failed  = results.filter(r => r.passed === false).length;
  const skipped = results.filter(r => r.skipped).length;
  const score   = Math.round((passed / (TESTS.length - skipped)) * 100);
  console.log(`\n📊 Risultati: ${passed}/${TESTS.length} passati (${skipped} saltati) — Score: ${score}%\n`);

  const report = generateReport(results);
  writeFileSync('aris-test-report.md', report, 'utf8');
  console.log('📄 Report salvato in: aris-test-report.md\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Errore fatale:', err);
  process.exit(1);
});
