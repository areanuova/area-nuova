import { ArisTool } from './base-tool';
import { getAdminSupabase } from '../supabase-admin';
import { extractKeywords, scoreDocuments } from '../shared/keywords';
import type { ToolResult } from '../agent/types';
import type { Source } from '../types';

interface DocRow { titolo: string; url: string | null; contenuto: string; source: string; }

const PATTERNS: RegExp[] = [
  /\bnotizie\b/i,
  /\bnews\b/i,
  /\baggiornament[oi]\b/i,
  /\bnovità\b/i,
  /\bcomunicat[oi]\b/i,
  /\bannunci[oi]\b/i,
  /\bultime\s+notizie\b/i,
  /\brecentem?ente\b/i,
  /\bultim[aoie]\b/i,
  /\bquest[ao]\s+(?:settimana|mese|anno)\b/i,
];

export class NewsTool extends ArisTool {
  readonly id          = 'news';
  readonly name        = 'News e Comunicati';
  readonly description = 'Notizie, comunicati e aggiornamenti di Area Nuova';
  readonly priority    = 75;

  canHandle(query: string): number {
    return this.scorePatterns(PATTERNS, query);
  }

  async execute(query: string): Promise<ToolResult> {
    const sb = getAdminSupabase();

    const { data: dbRows, error } = await sb
      .from('aris_documents')
      .select('titolo, url, contenuto, source')
      .eq('source', 'news')
      .order('updated_at', { ascending: false })
      .limit(12);

    if (error) {
      console.error('[NewsTool]', error.message);
      return { toolId: this.id, data: '', sources: [], confidence: 0 };
    }

    const rows    = (dbRows ?? []) as DocRow[];
    const kws     = extractKeywords(query);
    const matched = kws.length
      ? scoreDocuments(rows, kws).slice(0, 4)
      : rows.slice(0, 4);

    if (!matched.length) {
      return {
        toolId:             this.id,
        data:               'Non sono presenti news o comunicati recenti nel database di Area Nuova.',
        sources:            [],
        confidence:         35,
        noLlm:              true,
        llmReasoningNeeded: false,
      };
    }

    const sources: Source[] = matched.map(d => ({ titolo: d.titolo, url: d.url, source: d.source }));

    const lista = matched.map(d => {
      const body = d.contenuto.trim().slice(0, 600);
      const link = d.url ? ` — [Leggi tutto](${d.url})` : '';
      return `**${d.titolo}**\n${body}${d.contenuto.length > 600 ? '…' : ''}${link}`;
    }).join('\n\n---\n\n');

    const intro = matched.length === 1
      ? 'Ecco l\'ultimo aggiornamento da Area Nuova:'
      : `Ecco gli ultimi ${matched.length} aggiornamenti da Area Nuova:`;

    return {
      toolId:             this.id,
      data:               `${intro}\n\n${lista}`,
      sources,
      confidence:         Math.min(70 + matched.length * 7, 93),
      noLlm:              true,
      llmReasoningNeeded: false,
    };
  }
}
