import { ArisTool } from './base-tool';
import { retrieveRelevantChunks } from '../retrieval';
import type { ToolResult } from '../agent/types';
import type { Source } from '../types';

const PATTERNS: RegExp[] = [
  /\bregolament[oi]\b/i,
  /\bmodulistica\b/i,
  /\bmodul[oi]\b/i,
  /\bdocument[oi]\b/i,
  /\bmozione\b/i,
  /\brichiesta\s+(?:formale|ufficiale)\b/i,
  /\bpetizione\b/i,
  /\bdelibera\b/i,
  /\bverbale\b/i,
  /\bstatuto\b/i,
  /\bistanza\b/i,
  /\batto\s+ufficiale\b/i,
  /\bmodulo\s+(?:di\s+)?richiesta\b/i,
];

const SOURCE_FILTER = ['documenti'];

export class RegolamentiTool extends ArisTool {
  readonly id          = 'regolamenti';
  readonly name        = 'Documenti e Regolamenti';
  readonly description = 'Modulistica, mozioni, delibere e documenti ufficiali';
  readonly priority    = 72;

  canHandle(query: string): number {
    return this.scorePatterns(PATTERNS, query);
  }

  async execute(query: string): Promise<ToolResult> {
    const chunks = await retrieveRelevantChunks(query, 6, SOURCE_FILTER);

    if (!chunks.length) {
      return { toolId: this.id, data: '', sources: [], confidence: 30, llmReasoningNeeded: false };
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
      .map((c, i) => `[Documento ${i + 1}] ${c.titolo}\n${c.chunk_text}`)
      .join('\n\n---\n\n');

    const topSim = chunks[0].similarity;
    const confidence = topSim >= 0.70 ? 90 : topSim >= 0.55 ? 78 : topSim >= 0.40 ? 62 : 35;

    return { toolId: this.id, data: text, sources, confidence, llmReasoningNeeded: true };
  }
}
