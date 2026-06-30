import { ArisTool } from './base-tool';
import { getAdminSupabase } from '../supabase-admin';
import { filterAction, navAction } from '../navigation/actions';
import type { NavigationAction } from '../navigation/types';
import type { ToolResult } from '../agent/types';
import type { Source } from '../types';

interface Alloggio {
  id: string;
  titolo: string;
  tipo: string;
  citta: string;
  zona: string | null;
  prezzo: number;
  spese_incluse: boolean;
  disponibile_da: string | null;
  descrizione: string;
  inserzionista_nome: string;
  inserzionista_email: string;
  inserzionista_telefono: string | null;
}

interface AlloggiFilters {
  tipo?:       string;
  prezzo_max?: number;
  zona?:       string;
}

const PATTERNS: RegExp[] = [
  /\ballogg[io]\b/i,
  /\bcas[ae]\b/i,
  /\bstanz[ae]\b/i,
  /\baffitt[oa]\b/i,
  /\bposto\s+letto\b/i,
  /\bappartament[io]\b/i,
  /\bbilocal[ei]\b/i,
  /\bmonolocal[ei]\b/i,
  /\bfuorisede\b/i,
  /\bposto\s+alloggio\b/i,
  /dove\s+(vivere|stare|dormire|abitare)/i,
  /\bcerco\s+(un[ao]?\s+)?(casa|posto|alloggio|stanza|appartamento)/i,
];

function extractFilters(query: string): AlloggiFilters {
  const filters: AlloggiFilters = {};

  if (/appartament[io]|bilocal[ei]/i.test(query))    filters.tipo = 'appartamento';
  else if (/monolocal[ei]|studio\b/i.test(query))    filters.tipo = 'monolocale';
  else if (/posto\s+letto|stanz[ae]\b/i.test(query)) filters.tipo = 'stanza';

  const priceMatch =
    query.match(/(?:meno\s+di|sotto\s+i?|max|fino\s+a)\s*(\d+)\s*(?:euro|€)?/i) ??
    query.match(/(\d{2,4})\s*(?:euro|€)(?:\s*(?:al\s*mese|mensili?))?/i);
  if (priceMatch) filters.prezzo_max = parseInt(priceMatch[1], 10);

  const zonaMatch = query.match(/(?:in\s+zona|zona|quartiere)\s+(\w+)/i);
  if (zonaMatch) filters.zona = zonaMatch[1].trim();

  return filters;
}

export class AlloggiTool extends ArisTool {
  readonly id          = 'alloggi';
  readonly name        = 'Alloggi Disponibili';
  readonly description = 'Annunci di alloggi, case, stanze e posti letto per studenti';
  readonly priority    = 85;

  canHandle(query: string): number {
    return this.scorePatterns(PATTERNS, query);
  }

  async execute(query: string): Promise<ToolResult> {
    const sb      = getAdminSupabase();
    const filters = extractFilters(query);
    const oggi    = new Date().toISOString().split('T')[0];

    let q = sb
      .from('alloggi')
      .select('id, titolo, tipo, citta, zona, prezzo, spese_incluse, disponibile_da, descrizione, inserzionista_nome, inserzionista_email, inserzionista_telefono')
      .eq('stato', 'pubblicato')
      .gte('scade_il', oggi)
      .order('prezzo', { ascending: true })
      .limit(8);

    if (filters.tipo)       q = q.ilike('tipo', `%${filters.tipo}%`);
    if (filters.prezzo_max) q = q.lte('prezzo', filters.prezzo_max);
    if (filters.zona)       q = q.ilike('zona', `%${filters.zona}%`);

    const { data, error } = await q;

    if (error) {
      console.error('[AlloggiTool]', error.message);
      return { toolId: this.id, data: '', sources: [], confidence: 0 };
    }

    const alloggi = (data ?? []) as Alloggio[];
    const navFilters: Record<string, string> = {};
    if (filters.tipo)       navFilters.tipo      = filters.tipo;
    if (filters.prezzo_max) navFilters.prezzo_max = String(filters.prezzo_max);
    if (filters.zona)       navFilters.zona       = filters.zona;

    const actions: NavigationAction[] = [
      Object.keys(navFilters).length
        ? filterAction('alloggi', 'Visualizza alloggi con i filtri', navFilters)
        : navAction('alloggi'),
    ];

    if (!alloggi.length) {
      const filterDesc = [
        filters.tipo       ? `tipo: ${filters.tipo}`           : null,
        filters.prezzo_max ? `max €${filters.prezzo_max}/mese` : null,
        filters.zona       ? `zona: ${filters.zona}`           : null,
      ].filter(Boolean).join(', ');

      const msg = filterDesc
        ? `Non ci sono alloggi disponibili con i filtri richiesti (${filterDesc}).`
        : 'Al momento non ci sono alloggi disponibili nella piattaforma di Area Nuova.';

      return { toolId: this.id, data: msg, sources: [], confidence: 72, noLlm: true, llmReasoningNeeded: false, actions };
    }

    const lista = alloggi.map(a => {
      const prezzo = `€${a.prezzo}/mese${a.spese_incluse ? ' (spese incluse)' : ' (spese escluse)'}`;
      const disp   = a.disponibile_da ? `dal ${a.disponibile_da}` : 'subito';
      const zona   = a.zona ? ` — zona: ${a.zona}` : '';
      const tel    = a.inserzionista_telefono ? ` | Tel: ${a.inserzionista_telefono}` : '';

      return [
        `**${a.titolo}**`,
        `Tipo: ${a.tipo} | Città: ${a.citta}${zona}`,
        `Prezzo: ${prezzo} | Disponibile: ${disp}`,
        `Contatto: ${a.inserzionista_nome} — ${a.inserzionista_email}${tel}`,
        `Descrizione: ${a.descrizione.slice(0, 200)}${a.descrizione.length > 200 ? '…' : ''}`,
        `Link: /alloggi/${a.id}`,
      ].join('\n');
    });

    const sources: Source[] = alloggi.map(a => ({
      titolo: a.titolo,
      url:    `/alloggi/${a.id}`,
      source: 'alloggi',
    }));

    return {
      toolId:     this.id,
      data:       `Alloggi disponibili (aggiornati in tempo reale):\n\n${lista.join('\n\n---\n\n')}`,
      sources,
      confidence: Math.min(75 + alloggi.length * 3, 98),
      noLlm:      true,
      actions,
    };
  }
}
