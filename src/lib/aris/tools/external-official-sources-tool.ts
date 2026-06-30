import { ArisTool }          from './base-tool';
import { getAdminSupabase }  from '../supabase-admin';
import { extractKeywords }   from '../shared/keywords';
import { formatLastSeen }    from '../external/freshness';
import { EXTERNAL_SOURCE_IDS } from '../external/registry';
import type { ToolResult }   from '../agent/types';
import type { Source }       from '../types';

interface ExtRow {
  title:       string;
  url:         string;
  excerpt:     string;
  content:     string;
  source_id:   string;
  last_seen_at: string | null;
  metadata:    Record<string, unknown>;
}

const SOURCE_LABEL: Record<string, string> = {
  'external-unifg':  'Università di Foggia',
  'external-adisu':  'ADISU Puglia',
  'external-mur':    'MUR — Ministero Università e Ricerca',
};

const PATTERNS: RegExp[] = [
  // UniFg
  /\bunifg\b/i,
  /\buniversit[aà]\s+di\s+foggia\b/i,
  /\bateneo\b/i,
  /\bsegreteria\s+(?:studenti|universitaria)\b/i,
  /\bimmatricolazione\b/i,
  /\btasse\b/i,
  /\berasmus\b/i,
  /\bcalendario\s+accademico\b/i,
  /\bmanifesto\s+(?:degli\s+studi|studi)\b/i,
  /\bpiano\s+di\s+studi\b/i,
  // ADISU
  /\badisu\b/i,
  /\bdiritto\s+allo\s+studio\b/i,
  /\bbors[ae]\s+di\s+studio\b/i,
  /\bgraduatori[ae]\b/i,
  /\bcontributo\s+universitari[oa]\b/i,
  /\bmensa\b/i,
  /\bcasa\s+dello\s+studente\b/i,
  /\balloggi\s+(?:adisu|universitari|studenti)\b/i,
  /\bbenefici\s+(?:adisu|universitari|studenti)\b/i,
  // MUR
  /\bmur\b/i,
  /\bministero\s+(?:dell[ae]?\s+)?universit[aà]\b/i,
  /\baccesso\s+(?:a|ai?)\s+medicina\b/i,
  /\baccesso\s+programmato\b/i,
  /\bdecreto\s+ministeriale\b/i,
  // Bandi ufficiali
  /\bfonti?\s+ufficiali?\b/i,
  /\bscadenz[ae]\s+(?:ufficiali?|iscrizioni?)\b/i,
  /\bavvisi?\s+ufficiali?\b/i,
  /\bbando\s+(?:ufficiale|ammissione|dottorato|adisu|benefici|borsa|studio|its|orfani)\b/i,
  /\bregolamenta?zione\s+ministeriale\b/i,
];

export class ExternalOfficialSourcesTool extends ArisTool {
  readonly id          = 'external-official';
  readonly name        = 'Fonti Ufficiali Esterne';
  readonly description = 'UniFg, ADISU Puglia e MUR: informazioni ufficiali sempre aggiornate';
  readonly priority    = 82;

  canHandle(query: string): number {
    return this.scorePatterns(PATTERNS, query);
  }

  async execute(query: string): Promise<ToolResult> {
    const sb       = getAdminSupabase();
    const keywords = extractKeywords(query);

    // Keyword search on title and excerpt from aris_external_documents
    let rows: ExtRow[] = [];

    if (keywords.length > 0) {
      // Build OR filter across title + excerpt for top keywords (max 4)
      const topKw  = keywords.slice(0, 4);
      const filter = topKw
        .map(kw => `title.ilike.%${kw}%,excerpt.ilike.%${kw}%,content.ilike.%${kw}%`)
        .join(',');

      const { data, error } = await sb
        .from('aris_external_documents')
        .select('title, url, excerpt, content, source_id, last_seen_at, metadata')
        .eq('status', 'active')
        .in('source_id', EXTERNAL_SOURCE_IDS)
        .or(filter)
        .order('last_seen_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('[ExternalOfficialSourcesTool]', error.message);
      } else {
        rows = (data ?? []) as ExtRow[];
      }
    }

    // Fallback: recenti se nessun keyword match
    if (rows.length === 0) {
      const { data } = await sb
        .from('aris_external_documents')
        .select('title, url, excerpt, content, source_id, last_seen_at, metadata')
        .eq('status', 'active')
        .in('source_id', EXTERNAL_SOURCE_IDS)
        .order('last_seen_at', { ascending: false })
        .limit(6);

      rows = (data ?? []) as ExtRow[];
    }

    if (rows.length === 0) {
      return {
        toolId:             this.id,
        data:               'Non ho trovato una fonte ufficiale verificabile su questo punto nelle fonti indicizzate (UniFg, ADISU Puglia, MUR). Per informazioni aggiornate consulta direttamente: unifg.it, adisupuglia.it o mur.gov.it.',
        sources:            [],
        confidence:         55,
        noLlm:              true,
        llmReasoningNeeded: false,
      };
    }

    // Query complessa → serve Gemini per sintetizzare/spiegare
    const COMPLEX = /\bspieg[ah]|requisiti|confronta|riassumi|cosa\s+dice|in\s+dettaglio|differenz|come\s+funziona/i;
    const isComplex = COMPLEX.test(query);

    // Re-rank by keyword matches in title
    const scored = rows.map(r => {
      const text = `${r.title} ${r.excerpt}`.toLowerCase();
      const hits = keywords.filter(kw => text.includes(kw)).length;
      return { ...r, _score: hits };
    }).sort((a, b) => b._score - a._score);

    const top     = scored.slice(0, 5);
    const sources: Source[] = top.map(r => ({
      titolo: r.title,
      url:    r.url,
      source: r.source_id,
    }));

    const sections = top.map(r => {
      const ente      = SOURCE_LABEL[r.source_id] ?? r.source_id;
      const freshness = formatLastSeen(r.last_seen_at);
      return [
        `**${r.title}**`,
        `*Fonte: ${ente} — aggiornato: ${freshness}*`,
        r.excerpt,
        `[Leggi su sito ufficiale](${r.url})`,
      ].join('\n');
    });

    const confidence = Math.min(60 + top.reduce((acc, r) => acc + r._score, 0) * 5, 91);

    return {
      toolId:             this.id,
      data:               sections.join('\n\n---\n\n'),
      sources,
      confidence,
      noLlm:              !isComplex,
      llmReasoningNeeded: isComplex,
    };
  }
}
