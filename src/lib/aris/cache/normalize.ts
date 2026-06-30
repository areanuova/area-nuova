const SYNONYMS: Array<[RegExp, string]> = [
  // Alloggi
  [/\bcasa\b/gi,           'alloggio'],
  [/\bstanza\b/gi,         'alloggio'],
  [/\bappartamento\b/gi,   'alloggio'],
  [/\bmonolocale\b/gi,     'alloggio'],
  [/\bbilocale\b/gi,       'alloggio'],
  [/\bposto letto\b/gi,    'alloggio'],
  [/\baffitto\b/gi,        'alloggio'],
  // Borse / ADISU
  [/\bborsa studio\b/gi,   'borsa di studio'],
  [/\bborse studio\b/gi,   'borse di studio'],
  [/\bborsa\b/gi,          'borsa di studio'],
  [/\bcontributo\b/gi,     'borsa di studio'],
  // Esse3
  [/\besse ?3\b/gi,        'esse3'],
  [/\bportale studenti\b/gi, 'esse3'],
  // WhatsApp
  [/\bgruppo\b/gi,         'gruppo whatsapp'],
  [/\bchat\b/gi,           'gruppo whatsapp'],
  [/\btelegram\b/gi,       'gruppo whatsapp'],
  // Università
  [/\bunifg\b/gi,          'università di foggia'],
  [/\bateneo\b/gi,         'università di foggia'],
  // Convenzioni
  [/\bsconto\b/gi,         'convenzione'],
  [/\bofferta\b/gi,        'convenzione'],
  [/\bdiscount\b/gi,       'convenzione'],
];

export function normalizeQuery(query: string): string {
  let q = query.toLowerCase().trim();
  // Remove punctuation except apostrophes
  q = q.replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [pattern, canonical] of SYNONYMS) {
    q = q.replace(pattern, canonical);
  }
  return q;
}
