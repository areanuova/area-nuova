/**
 * Intent Router di Aris.
 *
 * Classifica la query dell'utente e restituisce:
 *   - `sourceFilter`: filtro da passare alla ricerca semantica (null = tutte le fonti)
 *   - `liveQuery`:    se 'alloggi', il handler deve anche interrogare Supabase live
 *   - `confidence`:   0–1 (quanto è sicura la classificazione)
 */

export type Intent =
  | 'alloggi'
  | 'convenzioni'
  | 'gruppi-whatsapp'
  | 'guide'
  | 'news'
  | 'documenti'
  | 'eventi'
  | 'progetti'
  | 'generica';

export interface RouterResult {
  intent: Intent;
  sourceFilter: string[] | null;
  liveQuery: 'alloggi' | null;
  confidence: number;
}

interface IntentRule {
  intent: Intent;
  patterns: RegExp[];
  sourceFilter: string[] | null;
  liveQuery: 'alloggi' | null;
}

const RULES: IntentRule[] = [
  {
    intent: 'alloggi',
    patterns: [
      /\ballogg[io]\b/i, /\bcas[ae]\b/i, /\bstanz[ae]\b/i, /\baffitt[oa]\b/i,
      /\bposto\s+letto\b/i, /\bappartament[io]\b/i, /\bbilocal[ei]\b/i,
      /\bmonolocal[ei]\b/i, /\bfuorisede\b/i, /\bposto\s+alloggio\b/i,
      /dove\s+(vivere|stare|dormire|abitare)/i, /\bcerco\s+(un\s+)?(casa|posto|alloggio)/i,
    ],
    sourceFilter: null,
    liveQuery: 'alloggi',
  },
  {
    intent: 'convenzioni',
    patterns: [
      /\bconvenzion[ei]\b/i, /\bdiscount\s+card\b/i, /\bscont[oi]\b/i,
      /\boffert[ae]\b/i, /\bconvenzionat[oi]\b/i, /\bnegozi[oi]\b/i,
      /\bristorant[ei]\b/i, /\bpizzeri[ae]\b/i, /\bpalestra\b/i,
      /\bbar\s+convenzionat/i, /\bpartner\b/i, /\battività\s+convenzionat/i,
    ],
    sourceFilter: ['convenzioni'],
    liveQuery: null,
  },
  {
    intent: 'gruppi-whatsapp',
    patterns: [
      /\bgruppo\s+whatsapp\b/i, /\bchat\s+whatsapp\b/i, /\bwhatsapp\b/i,
      /\bgruppo\s+telegram\b/i, /\bgruppo\s+(del\s+)?corso\b/i,
      /\bgruppo\s+studenti\b/i, /\bcomunità\s+online\b/i, /\blink\s+gruppo\b/i,
    ],
    sourceFilter: ['gruppi-whatsapp'],
    liveQuery: null,
  },
  {
    intent: 'guide',
    patterns: [
      /\bguida\b/i, /\bcome\s+(mi\s+)?(iscrivo|faccio|ottengo|accedo|scarico)/i,
      /\bprocedura\b/i, /\bpasso\s+(a\s+passo|per\s+passo)\b/i,
      /\besse3\b/i, /\bisee\b/i, /\btasse\s+universitari[ae]\b/i,
      /\bcertificat[oi]\b/i, /\berasmus\b/i, /\bmail\s+istituzional[ei]\b/i,
      /\bdsa\b/i, /\bdisabilità\b/i, /\bbadge\b/i, /\btesserino\b/i,
      /\bsemestre\s+filtro\b/i, /\bborsa\s+di\s+studio\b/i, /\badisu\b/i,
      /\bimmatricolazion[ei]\b/i, /\biscrizione\s+(al|al\s+corso)/i,
      /\bresidenza\b/i, /\bdomicilio\b/i, /\bdichiarazione\b/i,
    ],
    sourceFilter: ['guide'],
    liveQuery: null,
  },
  {
    intent: 'news',
    patterns: [
      /\bnotizie\b/i, /\bnews\b/i, /\baggiornament[oi]\b/i, /\bnovità\b/i,
      /\bcomunicat[oi]\b/i, /\bannunci[oi]\b/i, /\bultime\s+notizie\b/i,
    ],
    sourceFilter: ['news'],
    liveQuery: null,
  },
  {
    intent: 'documenti',
    patterns: [
      /\bmodul[oi]\b/i, /\bmodulistica\b/i, /\bdocument[oi]\b/i,
      /\bmozione\b/i, /\brichiesta\s+(formale|ufficiale)\b/i,
      /\bpetizione\b/i, /\bdelibera\b/i, /\bverbale\b/i, /\bstatuto\b/i,
    ],
    sourceFilter: ['documenti'],
    liveQuery: null,
  },
  {
    intent: 'eventi',
    patterns: [
      /\bevent[oi]\b/i, /\bfesta\b/i, /\bmanifestazione\b/i, /\briunione\b/i,
      /\bassemblea\b/i, /\bincontro\b/i, /\bcalendario\b/i, /\bprossimi\s+eventi\b/i,
    ],
    sourceFilter: ['eventi'],
    liveQuery: null,
  },
  {
    intent: 'progetti',
    patterns: [
      /\bprogett[oi]\b/i, /\biniziativa\b/i, /\bcampagna\b/i,
      /\bcos(?:'|a)\s+fa\s+(area\s+nuova|l'associazione)\b/i,
      /\battività\s+(di\s+)?(area\s+nuova|l'associazione)\b/i,
    ],
    sourceFilter: ['progetti'],
    liveQuery: null,
  },
];

export function detectIntent(query: string): RouterResult {
  let bestMatch: IntentRule | null = null;
  let bestCount = 0;

  for (const rule of RULES) {
    const count = rule.patterns.filter((p) => p.test(query)).length;
    if (count > bestCount) {
      bestCount = count;
      bestMatch = rule;
    }
  }

  if (!bestMatch || bestCount === 0) {
    return { intent: 'generica', sourceFilter: null, liveQuery: null, confidence: 0 };
  }

  const confidence = Math.min(bestCount / 2, 1);

  return {
    intent: bestMatch.intent,
    sourceFilter: bestMatch.sourceFilter,
    liveQuery: bestMatch.liveQuery,
    confidence,
  };
}
