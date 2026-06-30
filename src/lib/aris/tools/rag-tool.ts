import { ArisTool } from './base-tool';
import { retrieveRelevantChunks } from '../retrieval';
import type { ToolResult } from '../agent/types';
import type { Source } from '../types';

/**
 * Universal RAG fallback tool.
 * Activated when no specialist tool matches the query.
 * Confidence is derived from the top similarity score returned by pgvector.
 */
export class RagTool extends ArisTool {
  readonly id          = 'rag';
  readonly name        = 'Ricerca Semantica (RAG)';
  readonly description = 'Ricerca semantica su tutta la base di conoscenza indicizzata';
  readonly priority    = 10;

  canHandle(_query: string): number {
    return 35;  // Always available as fallback; lower than any specialist tool (min 60)
  }

  async execute(query: string): Promise<ToolResult> {
    const chunks = await retrieveRelevantChunks(query);

    if (!chunks.length) {
      return { toolId: this.id, data: '', sources: [], confidence: 0, llmReasoningNeeded: false };
    }

    const seen    = new Set<string>();
    const sources: Source[] = [];
    for (const c of chunks) {
      if (!seen.has(c.document_id)) {
        seen.add(c.document_id);
        sources.push({ titolo: c.titolo, url: c.url, source: c.source });
      }
    }

    const text = chunks
      .map((c, i) => `[Fonte ${i + 1}] ${c.titolo}\n${c.chunk_text}`)
      .join('\n\n---\n\n');

    const topSim = chunks[0].similarity;
    const confidence = topSim >= 0.70 ? 88 : topSim >= 0.55 ? 72 : topSim >= 0.40 ? 55 : 30;

    return { toolId: this.id, data: text, sources, confidence, llmReasoningNeeded: true };
  }
}
