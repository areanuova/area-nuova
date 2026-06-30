import { ArisTool } from './base-tool';
import { getAdminSupabase } from '../supabase-admin';
import { extractKeywords, scoreDocuments } from '../shared/keywords';
import type { ToolResult } from '../agent/types';
import type { Source } from '../types';

interface DocRow { titolo: string; url: string | null; contenuto: string; source: string; }

const PATTERNS: RegExp[] = [
  /\bguida\b/i,
  /\bprocedura\b/i,
  /come\s+(mi\s+)?(iscrivo|faccio|ottengo|accedo|scarico|richied[eo]|rinov[oa])/i,
  /\bimmatricolazion[ei]\b/i,
  /\biscrizion[ei]\b/i,
  /\besse3\b/i,
  /\bisee\b/i,
  /\btasse\s+universitari[ae]\b/i,
  /\berasmus\b/i,
  /\bcertificat[oi]\b/i,
  /\bdsa\b/i,
  /\bdisabilità\b/i,
  /\bbadge\b/i,
  /\btesserino\b/i,
  /\bborsa\s+di\s+studio\b/i,
  /\badisu\b/i,
  /\bmail\s+istituzional[ei]\b/i,
  /\bsemestre\s+filtro\b/i,
  /\bpiano\s+di\s+studi\b/i,
  /\blibretto\b/i,
  /\bresidenza\b/i,
  /\bdomicilio\b/i,
  /\bdichiarazione\b/i,
  /\bcarriera\s+universitaria\b/i,
  /\bcorso\s+di\s+laurea\b/i,
];

export class GuideTool extends ArisTool {
  readonly id          = 'guide';
  readonly name        = 'Guide Universitarie';
  readonly description = 'Procedure universitarie, guide pratiche, adempimenti';
  readonly priority    = 80;

  canHandle(query: string): number {
    return this.scorePatterns(PATTERNS, query);
  }

  async execute(query: string): Promise<ToolResult> {
    const sb = getAdminSupabase();

    const { data: dbRows, error } = await sb
      .from('aris_documents')
      .select('titolo, url, contenuto, source')
      .eq('source', 'guide')
      .order('titolo');

    if (error) {
      console.error('[GuideTool]', error.message);
      return { toolId: this.id, data: '', sources: [], confidence: 0 };
    }

    const rows    = (dbRows ?? []) as DocRow[];
    const kws     = extractKeywords(query);
    const matched = scoreDocuments(rows, kws).slice(0, 3);

    if (!matched.length) {
      return {
        toolId:             this.id,
        data:               '',
        sources:            [],
        confidence:         30,
        llmReasoningNeeded: false,
      };
    }

    const text    = matched.map(d => `### ${d.titolo}\n${d.contenuto.slice(0, 1400)}`).join('\n\n---\n\n');
    const sources: Source[] = matched.map(d => ({ titolo: d.titolo, url: d.url, source: d.source }));

    // Le guide spiegano procedure — serve Gemini per sintetizzarle
    return {
      toolId:             this.id,
      data:               text,
      sources,
      confidence:         Math.min(70 + matched.length * 8, 94),
      llmReasoningNeeded: true,
    };
  }
}
