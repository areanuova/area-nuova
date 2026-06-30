import '../tools/index'; // side effect: registers all tools in the registry
import { planQuery }    from './planner';
import { executeTool }  from './executor';
import { getAIProvider } from '../ai/provider';
import { normalizeQuery } from '../cache/normalize';
import { queryCache }     from '../cache/cache';
import type { ChatMessage, Affidabilita } from '../types';
import type { ToolResult } from './types';

const HISTORY_LIMIT  = 10;
const MIN_CONFIDENCE = 50;

const LOW_CONFIDENCE_MSG =
  'Non sono riuscito a trovare informazioni sufficientemente affidabili su questo argomento nel mio database. ' +
  "Prova a riformulare la domanda, oppure contatta direttamente Area Nuova all'indirizzo areanuova@unifg.it.";

function buildSystemPrompt(result: ToolResult, context?: string): string {
  const ctxLine = context
    ? `\nCONTESTO STUDENTE: ${context}\n`
    : '';
  return `Sei Aris, l'assistente digitale ufficiale di Area Nuova, associazione studentesca dell'Università di Foggia.${ctxLine}

REGOLE ASSOLUTE — non derogabili:
1. Rispondi ESCLUSIVAMENTE usando i DATI FORNITI qui sotto.
2. NON usare mai la tua conoscenza di addestramento o informazioni esterne.
3. Se l'informazione non è nei dati forniti, dichiaralo esplicitamente.
4. NON inventare date, numeri, nomi, link, procedure o regolamenti.
5. Non rispondere a domande non attinenti all'università o ad Area Nuova.
6. Rispondi in italiano, in modo chiaro, preciso e amichevole.
7. Cita la fonte quando fornisci informazioni specifiche.

STRUTTURA RISPOSTA (markdown):

**Risposta**
[risposta chiara basata SOLO sui dati forniti]

**Passi consigliati** *(includi solo se ci sono azioni concrete da intraprendere)*
- [passo 1]

**Livello di affidabilità**
[scrivi solo uno di questi tre valori: Alta | Media | Informazione non trovata]

DATI RECUPERATI DALLO STRUMENTO "${result.toolId}" (affidabilità: ${result.confidence}/100):

${result.data || 'Nessun dato disponibile.'}`;
}

function toAffidabilita(confidence: number): Affidabilita {
  if (confidence >= 80) return 'alta';
  if (confidence >= 55) return 'media';
  return 'non_trovata';
}

function isQuotaError(msg: string): boolean {
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
}

export async function runAgent(
  message:    string,
  history:    ChatMessage[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  context?:   string,
): Promise<void> {
  const enc  = new TextEncoder();
  const send = (evt: object) =>
    controller.enqueue(enc.encode(`data: ${JSON.stringify(evt)}\n\n`));

  try {
    // ── 1. Normalize query + check cache ─────────────────────
    const normalized = normalizeQuery(message);
    const cached = queryCache.get(normalized);
    if (cached) {
      send({ type: 'chunk', content: cached.content });
      send({
        type:         'meta',
        tool:         cached.toolId,
        confidence:   cached.confidence,
        sources:      cached.sources,
        affidabilita: toAffidabilita(cached.confidence),
        actions:      cached.actions,
      });
      return;
    }

    // ── 2. Deterministic planning ─────────────────────────────
    const plan   = planQuery(normalized);
    const result = await executeTool(plan.toolId, normalized);

    // ── 3. Confidence gate ────────────────────────────────────
    if (result.confidence < MIN_CONFIDENCE) {
      send({ type: 'chunk', content: LOW_CONFIDENCE_MSG });
      send({ type: 'meta', sources: [], affidabilita: 'non_trovata' });
      return;
    }

    // ── 4. Decisione LLM ─────────────────────────────────────
    // noLlm:true → mai Gemini
    // llmReasoningNeeded:false → mai Gemini
    // llmReasoningNeeded:true → chiama sempre Gemini
    // non specificato → chiama Gemini (comportamento legacy)
    const skipLlm = result.noLlm === true || result.llmReasoningNeeded === false;

    if (skipLlm) {
      send({ type: 'chunk', content: result.data });
      send({
        type:         'meta',
        tool:         result.toolId,
        confidence:   result.confidence,
        sources:      result.sources,
        affidabilita: toAffidabilita(result.confidence),
        actions:      result.actions,
      });
      queryCache.set(normalized, {
        content:    result.data,
        toolId:     result.toolId,
        confidence: result.confidence,
        sources:    result.sources,
        actions:    result.actions,
      });
      return;
    }

    // ── 5. LLM streaming ──────────────────────────────────────
    const provider       = getAIProvider();
    const systemPrompt   = buildSystemPrompt(result, context);
    const trimmedHistory = history.slice(-HISTORY_LIMIT);
    let   fullContent    = '';

    for await (const token of provider.streamCompletion({
      systemPrompt,
      messages:    [...trimmedHistory, { role: 'user', content: message }],
      temperature: 0.1,
      maxTokens:   900,
    })) {
      send({ type: 'chunk', content: token });
      fullContent += token;
    }

    // ── 6. Metadata + cache ───────────────────────────────────
    const meta = {
      type:         'meta',
      tool:         result.toolId,
      confidence:   result.confidence,
      sources:      result.sources,
      affidabilita: toAffidabilita(result.confidence),
      actions:      result.actions,
    };
    send(meta);

    if (fullContent) {
      queryCache.set(normalized, {
        content:    fullContent,
        toolId:     result.toolId,
        confidence: result.confidence,
        sources:    result.sources,
        actions:    result.actions,
      });
    }
  } catch (err) {
    const msg     = err instanceof Error ? err.message : String(err);
    console.error('[ArisAgent]', msg);
    const userMsg = isQuotaError(msg)
      ? 'Il servizio AI ha raggiunto il limite di utilizzo giornaliero. Riprova tra qualche ora.'
      : 'Si è verificato un errore. Riprova tra qualche istante.';
    send({ type: 'error', message: userMsg });
  } finally {
    controller.enqueue(enc.encode('data: [DONE]\n\n'));
  }
}
