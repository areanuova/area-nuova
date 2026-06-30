import type { ExternalSourceDefinition, ExternalPage } from '../types';
import { extractTitle, htmlToText, extractExcerpt } from '../parser';

const BASE = 'https://www.adisupuglia.it';

// ADISU usa URL in formato /pagina{id}_{slug}.html (CMS legacy)
// allowInsecureTls: il sito serve catena TLS incompleta (Actalis OV CA G3 senza intermedio)
// PowerShell/.NET funziona (cert cached da Windows); Node.js richiede Agent senza TLS verify
const ENTRY_POINTS = [
  `${BASE}/pagina106703_borse-di-studio.html`,
  `${BASE}/pagina116497_alloggi.html`,
  `${BASE}/pagina116512_graduatorie.html`,
  `${BASE}/pagina22130_faq.html`,
  `${BASE}/pagina136385_bando-orfani.html`,
  `${BASE}/pagina116488_bando-its.html`,
];

export const AdisuSource: ExternalSourceDefinition = {
  id:                     'external-adisu',
  name:                   'ADISU Puglia (adisupuglia.it)',
  baseUrl:                BASE,
  allowedPaths:           ['/pagina'],
  deniedPaths:            ['/admin', '/wp-admin', '/cgi-bin', '/wp-login'],
  priority:               88,
  refreshIntervalMinutes: 90,
  maxPagesPerSync:        20,
  allowInsecureTls:       true,

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
      metadata: { ente: 'ADISU Puglia', source_id: 'external-adisu' },
    };
  },
};
