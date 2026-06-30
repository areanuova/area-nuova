import { ArisTool } from './base-tool';
import { retrieveRelevantChunks } from '../retrieval';
import type { ToolResult } from '../agent/types';
import type { Source } from '../types';

const PATTERNS: RegExp[] = [
  /\brappresentant[ei]\b/i,
  /\bsenato\s+accademico\b/i,
  /\bconsiglio\s+di\s+amministrazione\b/i,
  /\b(?:cda|c\.d\.a\.)\b/i,
  /\b(?:csu|c\.s\.u\.)\b/i,
  /\bnucleo\s+di\s+valutazione\b/i,
  /\borgano\s+(?:di\s+)?(?:rappresentanza|collegiale)\b/i,
  /chi\s+(ci\s+)?rappresenta/i,
  /\bdelegat[oi]\s+studenti\b/i,
  /\belezion[ei]\s+studentesch[ei]\b/i,
  /\blista\s+(?:studenti|elettorale)\b/i,
];

export class RappresentantiTool extends ArisTool {
  readonly id          = 'rappresentanti';
  readonly name        = 'Rappresentanti Studenteschi';
  readonly description = 'Chi rappresenta gli studenti negli organi universitari';
  readonly priority    = 70;

  canHandle(query: string): number {
    return this.scorePatterns(PATTERNS, query);
  }

  async execute(query: string): Promise<ToolResult> {
    const chunks = await retrieveRelevantChunks(query, 5, null);

    if (!chunks.length) {
      return {
        toolId:     this.id,
        data:       'Non ho trovato informazioni specifiche sui rappresentanti studenteschi nel mio database. Per informazioni aggiornate visita la sezione Rappresentanti del sito di Area Nuova.',
        sources:    [{ titolo: 'Rappresentanti Area Nuova', url: '/rappresentanti', source: 'rappresentanti' }],
        confidence: 55,
      };
    }

    const seen    = new Set<string>();
    const sources: Source[] = [];
    for (const c of chunks) {
      if (!seen.has(c.document_id)) {
        seen.add(c.document_id);
        sources.push({ titolo: c.titolo, url: c.url, source: c.source });
      }
    }

    sources.push({ titolo: 'Rappresentanti Area Nuova', url: '/rappresentanti', source: 'sito' });

    const text = chunks
      .map((c, i) => `[Fonte ${i + 1}] ${c.titolo}\n${c.chunk_text}`)
      .join('\n\n---\n\n');

    const topSim = chunks[0].similarity;
    const confidence = topSim >= 0.65 ? 80 : topSim >= 0.50 ? 65 : 55;

    return { toolId: this.id, data: text, sources, confidence };
  }
}
