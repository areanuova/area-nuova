const STOPWORDS = new Set([
  'il','lo','la','le','gli','i','un','una','uno','dei','del','della','delle',
  'degli','di','da','in','con','su','per','tra','fra','e','o','ma','se',
  'che','chi','cui','non','ho','hai','ha','mi','ti','si','ci','vi','ne',
  'al','ai','nel','nei','sul','sui','come','dove','quando','quanto','quale',
  'quali','sono','mio','mia','tuo','sua','suo','lui','lei','loro',
  'questo','questa','questi','queste','quel','quella','quelli','quelle',
  'vorrei','cerco','voglio','devo','posso','puoi','deve','cosa','anche',
  'già','ancora','sempre','mai','però','quindi','allora','ecco','bene',
  'tutto','tutti','tutte','altra','altro','altri','altre','ogni','molto',
  'poco','dopo','prima','mentre','oppure','ovvero','cioè',
]);

export function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\sàáèéìíîòóùú]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));
}

export function scoreDocuments<T extends { titolo: string; contenuto: string }>(
  docs: T[],
  keywords: string[],
): T[] {
  if (!keywords.length) return docs;

  return docs
    .map(doc => {
      const haystack = `${doc.titolo} ${doc.contenuto}`.toLowerCase();
      const hits = keywords.filter(k => haystack.includes(k)).length;
      return { doc, hits };
    })
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map(({ doc }) => doc);
}
