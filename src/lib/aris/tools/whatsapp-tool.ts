import { ArisTool } from './base-tool';
import { getAdminSupabase } from '../supabase-admin';
import { extractKeywords, scoreDocuments } from '../shared/keywords';
import { navAction, searchAction } from '../navigation/actions';
import type { ToolResult } from '../agent/types';
import type { Source } from '../types';

interface DocRow { titolo: string; url: string | null; contenuto: string; source: string; }

const PATTERNS: RegExp[] = [
  /\bwhatsapp\b/i,
  /\bgruppo\s+whatsapp\b/i,
  /\bchat\s+whatsapp\b/i,
  /\bgruppo\s+(del\s+)?corso\b/i,
  /\bgruppo\s+studenti\b/i,
  /\blink\s+(?:del\s+)?gruppo\b/i,
  /\bcomunità\s+online\b/i,
  /entrare\s+nel\s+gruppo/i,
  /\bgruppo\s+universitario\b/i,
  /\btelegram\b/i,
  /\bgruppo\s+(medicina|giurisprudenza|economia|ingegneria|lettere|scienze|farmacia|agraria|psicologia)\b/i,
  /\bgruppo\s+(primo|secondo|terzo|quarto|quinto)\s+anno\b/i,
];

export class WhatsAppTool extends ArisTool {
  readonly id          = 'whatsapp';
  readonly name        = 'Gruppi WhatsApp UniFg';
  readonly description = 'Gruppi WhatsApp per corsi e aree universitarie UniFg';
  readonly priority    = 80;

  canHandle(query: string): number {
    return this.scorePatterns(PATTERNS, query);
  }

  async execute(query: string): Promise<ToolResult> {
    const sb = getAdminSupabase();

    const { data: dbRows, error } = await sb
      .from('aris_documents')
      .select('titolo, url, contenuto, source')
      .eq('source', 'gruppi-whatsapp');

    if (error) {
      console.error('[WhatsAppTool]', error.message);
      return { toolId: this.id, data: '', sources: [], confidence: 0 };
    }

    const rows    = (dbRows ?? []) as DocRow[];
    const kws     = extractKeywords(query);
    const matched = kws.length
      ? scoreDocuments(rows, kws).slice(0, 6)
      : rows.slice(0, 6);

    const actions = [
      kws.length
        ? searchAction('gruppiWhatsapp', 'Cerca gruppo per corso', kws[0] ?? '')
        : navAction('gruppiWhatsapp'),
    ];

    if (!matched.length) {
      return {
        toolId:     this.id,
        data:       'Non ho trovato gruppi WhatsApp specifici per la tua ricerca. Puoi consultare tutti i gruppi disponibili nella [pagina dedicata](/gruppi-whatsapp).',
        sources:    [{ titolo: 'Gruppi WhatsApp UniFg', url: '/gruppi-whatsapp', source: 'gruppi-whatsapp' }],
        confidence: 65,
        noLlm:              true,
        llmReasoningNeeded: false,
        actions,
      };
    }

    const sources: Source[] = matched.map(d => ({ titolo: d.titolo, url: d.url, source: d.source }));

    const lista = matched.map(d => {
      const body = d.contenuto.trim().slice(0, 500);
      return `**${d.titolo}**\n${body}${d.contenuto.length > 500 ? '…' : ''}`;
    }).join('\n\n---\n\n');

    const intro = matched.length === 1
      ? 'Ecco il gruppo WhatsApp trovato:'
      : `Ecco ${matched.length} gruppi WhatsApp trovati:`;

    const data = `${intro}\n\n${lista}\n\n*Clicca sul link per entrare nel gruppo. Se il link non funziona, contatta Area Nuova.*`;

    return {
      toolId:     this.id,
      data,
      sources,
      confidence: Math.min(72 + matched.length * 5, 96),
      noLlm:      true,
      actions,
    };
  }
}
