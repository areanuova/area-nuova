import type { ExternalSourceDefinition, ExternalPage } from '../types';
import { extractTitle, htmlToText, extractExcerpt } from '../parser';

const BASE = 'https://www.unifg.it';

// URL verificati — il sito usa il prefisso /it/ per tutti i path
const ENTRY_POINTS = [
  `${BASE}/it/studente`,
  `${BASE}/it/futuro-studente`,
  `${BASE}/it/servizi-e-opportunita`,
  `${BASE}/it/servizi-e-opportunita/segreterie-online/tasse-e-contributi`,
  `${BASE}/it/servizi-e-opportunita/segreterie-online/segreterie-studenti-info-e-contatti`,
  `${BASE}/it/studiare/corsi-di-laurea/immatricolazioni`,
  `${BASE}/it/studiare/corsi-di-laurea/manifesto-degli-studi`,
  `${BASE}/it/internazionale/parti-con-unifg/studio-outgoing`,
  `${BASE}/it/avvisi`,
  `${BASE}/it/servizi-e-opportunita/opportunita/bandi-studenti`,
  `${BASE}/it/servizi-e-opportunita/vita-universitaria/alloggi-e-mense`,
  `${BASE}/it/servizi-e-opportunita/servizi/studenti-con-disabilita-dsa-e-bes`,
];

export const UnifgSource: ExternalSourceDefinition = {
  id:                     'external-unifg',
  name:                   'Università di Foggia (unifg.it)',
  baseUrl:                BASE,
  allowedPaths:           ['/it/studente', '/it/futuro-studente', '/it/laureato', '/it/servizi-e-opportunita', '/it/studiare', '/it/internazionale', '/it/avvisi', '/it/ateneo'],
  deniedPaths:            ['/admin', '/search', '/user', '/core/', '/profiles/', '/sites/default/files', '/filter', '/media/oembed'],
  priority:               90,
  refreshIntervalMinutes: 120,
  maxPagesPerSync:        25,

  getEntryPoints(): string[] {
    return ENTRY_POINTS;
  },

  parsePage(html: string, url: string): ExternalPage | null {
    const title   = extractTitle(html);
    const content = htmlToText(html);

    if (!title || content.length < 100) return null;

    const truncated = content.slice(0, 8000);
    const excerpt   = extractExcerpt(truncated);

    return {
      url,
      title,
      content:  truncated,
      excerpt,
      metadata: { ente: 'Università di Foggia', source_id: 'external-unifg' },
    };
  },
};
