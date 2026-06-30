export interface ArisRoute {
  path:        string;
  label:       string;
  description: string;
  external?:   boolean;
}

export const ROUTES: Record<string, ArisRoute> = {
  alloggi: {
    path:        '/alloggi',
    label:       'Alloggi per studenti',
    description: 'Annunci di case, stanze e appartamenti per studenti',
  },
  convenzioni: {
    path:        '/convenzioni',
    label:       'Convenzioni & Discount Card',
    description: 'Sconti e offerte riservati agli studenti UniFg',
  },
  gruppiWhatsapp: {
    path:        '/gruppi-whatsapp',
    label:       'Gruppi WhatsApp',
    description: 'Gruppi WhatsApp dei corsi di laurea UniFg',
  },
  rappresentanti: {
    path:        '/rappresentanti',
    label:       'Rappresentanti Studenti',
    description: 'Rappresentanti studenteschi UniFg',
  },
  home: {
    path:        '/',
    label:       'Home Area Nuova',
    description: 'Pagina principale Area Nuova',
  },
  unifg: {
    path:        'https://www.unifg.it',
    label:       'Università di Foggia',
    description: 'Sito ufficiale UniFg',
    external:    true,
  },
  adisu: {
    path:        'https://www.adisupuglia.it',
    label:       'ADISU Puglia',
    description: 'Sito ufficiale ADISU Puglia',
    external:    true,
  },
  esse3: {
    path:        'https://esse3.unifg.it',
    label:       'Portale Esse3 UniFg',
    description: 'Sistema gestione carriera universitaria',
    external:    true,
  },
};
