import { registry } from './registry';
import type { PlannerResult } from './types';

const FALLBACK_ID = 'rag';

/**
 * Deterministic planner: no LLM, no I/O.
 * Calls canHandle() on every registered tool and picks the highest scorer.
 * Falls back to the RAG tool when no specialist matches (score = 0).
 */
export function planQuery(query: string): PlannerResult {
  const tools = registry.getAll();

  let bestScore  = 0;
  let bestToolId = FALLBACK_ID;
  let bestReason = 'Nessun tool specializzato — RAG come fallback';

  for (const tool of tools) {
    if (tool.id === FALLBACK_ID) continue;  // RAG is always the implicit fallback
    const score = tool.canHandle(query);
    if (score > bestScore) {
      bestScore  = score;
      bestToolId = tool.id;
      bestReason = `"${tool.name}" selezionato (score: ${score})`;
    }
  }

  return { toolId: bestToolId, score: bestScore, reason: bestReason };
}
