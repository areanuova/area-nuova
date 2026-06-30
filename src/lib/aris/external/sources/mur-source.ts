import type { ExternalSourceDefinition, ExternalPage } from '../types';
import { extractTitle, htmlToText, extractExcerpt } from '../parser';

const BASE = 'https://www.mur.gov.it';

// URL verificati — MUR usa /it/aree-tematiche/universita/ come sezione principale
const ENTRY_POINTS = [
  `${BASE}/it/aree-tematiche/universita`,
  `${BASE}/it/aree-tematiche/universita/le-universita/universita-statali`,
  `${BASE}/it/aree-tematiche/universita/mobilita-internazionale`,
  `${BASE}/it/aree-tematiche/universita/offerta-formativa/dottorati`,
  `${BASE}/it/aree-tematiche/universita/programmazione-e-finanziamenti`,
  `${BASE}/it/housing-universitario`,
  `${BASE}/it/housing-universitario/avviso-housing`,
  `${BASE}/it/housing-universitario/faq-e-chiarimenti`,
];

export const MurSource: ExternalSourceDefinition = {
  id:                     'external-mur',
  name:                   'Ministero dell\'Università e della Ricerca (mur.gov.it)',
  baseUrl:                BASE,
  allowedPaths:           ['/it/aree-tematiche/universita', '/it/housing-universitario', '/it/aree-tematiche/ricerca'],
  deniedPaths:            ['/admin', '/search', '/user', '/core/', '/profiles/', '/filter', '/media/oembed', '/aree-tematiche/afam'],
  priority:               85,
  refreshIntervalMinutes: 240,
  maxPagesPerSync:        15,

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
      metadata: { ente: 'MUR — Ministero Università e Ricerca', source_id: 'external-mur' },
    };
  },
};
