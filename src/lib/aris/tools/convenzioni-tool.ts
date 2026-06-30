import { ArisTool } from './base-tool';
import { getAdminSupabase } from '../supabase-admin';
import { extractKeywords, scoreDocuments } from '../shared/keywords';
import { navAction, searchAction } from '../navigation/actions';
import type { ToolResult } from '../agent/types';
import type { Source } from '../types';

interface DocRow { titolo: string; url: string | null; contenuto: string; source: string; }

const PATTERNS: RegExp[] = [
  /\bconvenzion[ei]\b/i,
  /\bdiscount\s+card\b/i,
  /\bscont[oi]\b/i,
  /\boffert[ae]\b/i,
  /\bconvenzionat[oi]\b/i,
  /\bristorant[ei]\b/i,
  /\bpizzeri[ae]\b/i,
  /\bbar\b/i,
  /\bpalestra\b/i,
  /\bnegozi[oi]\b/i,
  /\bpartner\b/i,
  /dove\s+(mangio|mangiare|mangiamo)\b/i,
  /\bfarmacie?\b/i,
  /\bparrucchiere?\b/i,
  /\bcinem[ao]\b/i,
  /\babbigliamento\b/i,
  /\bsport\b/i,
  /\battività\s+convenzionat/i,
  /\bmangiare\b/i,
  /\bpizza\b/i,
  /\bcaffè\b/i,
  /\bgelato\b/i,
];

export class ConvenzioniTool extends ArisTool {
  readonly id          = 'convenzioni';
  readonly name        = 'Convenzioni Discount Card';
  readonly description = 'Convenzioni, sconti, negozi e partner Area Nuova';
  readonly priority    = 80;

  canHandle(query: string): number {
    return this.scorePatterns(PATTERNS, query);
  }

  async execute(query: string): Promise<ToolResult> {
    const sb = getAdminSupabase();

    const { data: dbRows, error } = await sb
      .from('aris_documents')
      .select('titolo, url, contenuto, source')
      .eq('source', 'convenzioni');

    if (error) {
      console.error('[ConvenzioniTool]', error.message);
      return { toolId: this.id, data: '', sources: [], confidence: 0 };
    }

    const rows    = (dbRows ?? []) as DocRow[];
    const kws     = extractKeywords(query);
    const matched = kws.length
      ? scoreDocuments(rows, kws).slice(0, 5)
      : rows.slice(0, 5);

    const actions = [
      kws.length
        ? searchAction('convenzioni', 'Cerca convenzioni per categoria', kws[0] ?? '')
        : navAction('convenzioni'),
    ];

    if (!matched.length) {
      return {
        toolId:     this.id,
        data:       'Non sono state trovate convenzioni attive corrispondenti alla tua ricerca. Puoi consultare tutte le convenzioni disponibili su [convenzioni.areanuova.it](/convenzioni).',
        sources:    [],
        confidence: 65,
        noLlm:              true,
        llmReasoningNeeded: false,
        actions,
      };
    }

    const sources: Source[] = matched.map(d => ({ titolo: d.titolo, url: d.url, source: d.source }));

    const lista = matched.map(d => {
      const body = d.contenuto.trim().slice(0, 400);
      return `**${d.titolo}**\n${body}${d.contenuto.length > 400 ? '…' : ''}`;
    }).join('\n\n---\n\n');

    const intro = matched.length === 1
      ? 'Ecco la convenzione trovata con la **Discount Card Area Nuova**:'
      : `Ecco ${matched.length} convenzioni trovate con la **Discount Card Area Nuova**:`;

    const data = `${intro}\n\n${lista}\n\n*Per accedere agli sconti mostra la tua Discount Card nei negozi convenzionati.*`;

    return {
      toolId:     this.id,
      data,
      sources,
      confidence: Math.min(72 + matched.length * 5, 97),
      noLlm:      true,
      actions,
    };
  }
}
