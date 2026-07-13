// Registro generico delle collection di contenuto gestibili dal pannello
// CMS (Sprint 4.0). Estende il pattern collaudato di Partnership (Sprint 3)
// a News, Guide, Documenti, Progetti, Video senza duplicare 5 volte le
// stesse route/form: un solo motore generico, guidato da questo registro,
// serve tutte le collection elencate qui.
//
// Partnership NON è stata migrata su questo registro: resta sul proprio
// modulo dedicato (src/lib/admin/{content-utils,validation}.ts), già
// verificato end-to-end in produzione — nessun motivo di rischiare una
// regressione su un percorso già collaudato per un beneficio puramente
// di riduzione duplicazione.

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'url'
  | 'date'
  | 'stringArray'
  | 'select'
  // Come 'url', ma con validazione di formato specifica per link WhatsApp
  // (chat.whatsapp.com / whatsapp.com/channel) e un pulsante "Genera QR"
  // sotto il campo — vedi src/lib/admin/whatsapp.ts.
  | 'whatsapp-link';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  maxLength?: number;
  /** Solo per type 'select': coppie valore/etichetta. */
  options?: { value: string; label: string }[];
  /** Valore di default se il campo è assente/vuoto. */
  default?: string | number | boolean;
  helpText?: string;
}

export interface ContentTypeDef {
  /** Identificatore usato nell'URL: /admin/contenuti/{tipo} */
  tipo: string;
  /** Nome della collection Astro (astro:content). */
  collection: string;
  label: string;
  labelPlurale: string;
  collectionDir: string;
  /** Campo usato come titolo nelle liste. */
  titleField: string;
  /** Campo che porta il workflow CMS draft/review/published/archived. */
  statoField: string;
  fields: FieldDef[];
  /** true se la collection ha un corpo Markdown modificabile. */
  hasBody: boolean;
}

const STATO_OPTIONS = [
  { value: 'draft', label: 'Bozza' },
  { value: 'review', label: 'In revisione' },
  { value: 'published', label: 'Pubblicato' },
  { value: 'archived', label: 'Archiviato' },
];

// Sprint 5.0B (Fase 7) — campi di pianificazione, uguali per ogni tipo di
// contenuto generico. Letti solo dal cron /api/cron/scheduled-publish (una
// volta al giorno: vedi vercel.json e la route stessa per il perché non è
// più frequente), mai dalle pagine pubbliche.
const SCHEDULING_FIELDS: FieldDef[] = [
  {
    key: 'pubblicaIl', label: 'Pubblica automaticamente il', type: 'date',
    helpText: 'Se impostata e lo stato è ancora bozza/revisione, il contenuto passa a "Pubblicato" al primo passaggio giornaliero del cron (non è istantaneo).',
  },
  {
    key: 'archiviaIl', label: 'Archivia automaticamente il', type: 'date',
    helpText: 'Se impostata e lo stato è ancora pubblicato, il contenuto passa ad "Archiviato" al primo passaggio giornaliero del cron (non è istantaneo).',
  },
];

export const CONTENT_TYPES: Record<string, ContentTypeDef> = {
  news: {
    tipo: 'news',
    collection: 'news',
    label: 'News',
    labelPlurale: 'News e comunicati',
    collectionDir: 'src/content/news',
    titleField: 'titolo',
    statoField: 'stato',
    hasBody: true,
    fields: [
      { key: 'titolo', label: 'Titolo', type: 'text', required: true, maxLength: 200 },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'autore', label: 'Autore', type: 'text', maxLength: 120 },
      {
        key: 'categoria', label: 'Categoria', type: 'select', default: 'comunicato',
        options: [
          { value: 'comunicato', label: 'Comunicato' },
          { value: 'risultati', label: 'Risultati' },
          { value: 'resoconto', label: 'Resoconto' },
          { value: 'avviso', label: 'Avviso' },
        ],
      },
      { key: 'estratto', label: 'Estratto', type: 'textarea', required: true, maxLength: 500 },
      { key: 'tag', label: 'Tag (uno per riga)', type: 'stringArray' },
      {
        key: 'copertina', label: 'Copertina (percorso immagine già presente nel repo)', type: 'text', maxLength: 300,
        helpText: 'Es. /images/news/copertina.jpg oppure un URL da /admin/media (pulsante "Copia URL").',
      },
      { key: 'stato', label: 'Stato', type: 'select', default: 'draft', options: STATO_OPTIONS },
      ...SCHEDULING_FIELDS,
    ],
  },

  guide: {
    tipo: 'guide',
    collection: 'guide',
    label: 'Guida',
    labelPlurale: 'Guide utili',
    collectionDir: 'src/content/guide',
    titleField: 'titolo',
    statoField: 'stato',
    hasBody: true,
    fields: [
      { key: 'titolo', label: 'Titolo', type: 'text', required: true, maxLength: 200 },
      { key: 'categoria', label: 'Categoria', type: 'text', default: 'Generale', maxLength: 60 },
      { key: 'perMatricole', label: 'Consigliata alle matricole', type: 'boolean' },
      { key: 'ordine', label: 'Ordine', type: 'number', default: 99 },
      { key: 'estratto', label: 'Estratto', type: 'textarea', maxLength: 500 },
      { key: 'stato', label: 'Stato', type: 'select', default: 'draft', options: STATO_OPTIONS },
      ...SCHEDULING_FIELDS,
    ],
  },

  documenti: {
    tipo: 'documenti',
    collection: 'documenti',
    label: 'Documento',
    labelPlurale: 'Mozioni e documenti',
    collectionDir: 'src/content/documenti',
    titleField: 'titolo',
    statoField: 'stato',
    hasBody: false,
    fields: [
      { key: 'titolo', label: 'Titolo', type: 'text', required: true, maxLength: 200 },
      {
        key: 'tipo', label: 'Tipo', type: 'select', default: 'documento',
        options: [
          { value: 'modulo', label: 'Modulo' },
          { value: 'mozione', label: 'Mozione' },
          { value: 'documento', label: 'Documento' },
          { value: 'proposta', label: 'Proposta' },
          { value: 'richiesta', label: 'Richiesta' },
        ],
      },
      { key: 'categoria', label: 'Categoria', type: 'text', default: 'Generale', maxLength: 60 },
      { key: 'anno', label: 'Anno', type: 'number', required: true, default: new Date().getFullYear() },
      {
        key: 'file', label: 'File (percorso in /public o URL esterno)', type: 'text', required: true, maxLength: 300,
        helpText: 'Es. /documenti/modulo.pdf, un URL esterno, oppure un URL da /admin/media (pulsante "Copia URL").',
      },
      { key: 'descrizione', label: 'Descrizione', type: 'textarea', maxLength: 500 },
      { key: 'stato', label: 'Stato', type: 'select', default: 'draft', options: STATO_OPTIONS },
      ...SCHEDULING_FIELDS,
    ],
  },

  progetti: {
    tipo: 'progetti',
    collection: 'progetti',
    label: 'Progetto',
    labelPlurale: 'Progetti',
    collectionDir: 'src/content/progetti',
    titleField: 'titolo',
    // Nota: la collection `progetti` ha già un campo `stato` con significato
    // diverso (attivo|concluso, ciclo di vita del progetto). Il workflow CMS
    // di pubblicazione usa quindi un campo separato, `statoPubblicazione`,
    // per non entrare in conflitto con quel significato esistente.
    statoField: 'statoPubblicazione',
    hasBody: true,
    fields: [
      { key: 'titolo', label: 'Titolo', type: 'text', required: true, maxLength: 200 },
      { key: 'descrizione', label: 'Descrizione', type: 'textarea', required: true, maxLength: 500 },
      {
        key: 'stato', label: 'Stato del progetto', type: 'select', default: 'attivo',
        options: [
          { value: 'attivo', label: 'Attivo' },
          { value: 'concluso', label: 'Concluso' },
        ],
      },
      { key: 'categoria', label: 'Categoria', type: 'text', default: 'Generale', maxLength: 60 },
      { key: 'dataInizio', label: 'Data inizio', type: 'date', required: true },
      { key: 'dataFine', label: 'Data fine', type: 'date' },
      {
        key: 'copertina', label: 'Copertina (percorso immagine già presente nel repo)', type: 'text', maxLength: 300,
        helpText: 'Es. /images/progetti/copertina.jpg oppure un URL da /admin/media (pulsante "Copia URL").',
      },
      { key: 'inEvidenza', label: 'In evidenza', type: 'boolean' },
      { key: 'statoPubblicazione', label: 'Stato pubblicazione', type: 'select', default: 'draft', options: STATO_OPTIONS },
      ...SCHEDULING_FIELDS,
    ],
  },

  video: {
    tipo: 'video',
    collection: 'video',
    label: 'Video',
    labelPlurale: 'Video',
    collectionDir: 'src/content/video',
    titleField: 'titolo',
    statoField: 'stato',
    hasBody: false,
    fields: [
      { key: 'titolo', label: 'Titolo', type: 'text', required: true, maxLength: 200 },
      { key: 'descrizione', label: 'Descrizione', type: 'textarea', maxLength: 500 },
      {
        key: 'youtubeId', label: 'YouTube (ID, URL completo o youtu.be)', type: 'text', maxLength: 300,
        helpText: 'Accetta un ID nudo, un URL youtube.com/watch o un link youtu.be — normalizzato automaticamente.',
      },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'inEvidenza', label: 'In evidenza', type: 'boolean' },
      { key: 'ordine', label: 'Ordine', type: 'number', default: 99 },
      { key: 'stato', label: 'Stato', type: 'select', default: 'draft', options: STATO_OPTIONS },
      ...SCHEDULING_FIELDS,
    ],
  },

  'gruppi-whatsapp': {
    tipo: 'gruppi-whatsapp',
    collection: 'gruppi-whatsapp',
    label: 'Gruppo WhatsApp',
    labelPlurale: 'Gruppi WhatsApp',
    collectionDir: 'src/content/gruppi-whatsapp',
    titleField: 'titolo',
    statoField: 'stato',
    hasBody: true,
    fields: [
      { key: 'titolo', label: 'Nome del gruppo', type: 'text', required: true, maxLength: 200 },
      {
        key: 'area', label: 'Area', type: 'select', default: 'medica',
        options: [
          { value: 'medica', label: 'Area Medica' },
          { value: 'giuridica', label: 'Area Giuridica' },
          { value: 'economica', label: 'Area Economica' },
          { value: 'umanistica', label: 'Area Umanistica' },
          { value: 'agraria-ingegneria', label: 'Agraria e Ingegneria' },
        ],
      },
      {
        key: 'categoria', label: 'Categoria', type: 'text', default: 'Generale', maxLength: 60,
        helpText: 'Suggerite: matricole, semestre filtro, corsi di laurea, dipartimenti, anni di corso, insegnamenti, tirocinio, Erasmus, servizi, opportunità, associazione, rappresentanza, eventi, orientamento, post-laurea.',
      },
      { key: 'corsi', label: 'Corsi di laurea (uno per riga)', type: 'stringArray' },
      { key: 'dipartimento', label: 'Dipartimento', type: 'text', maxLength: 120 },
      { key: 'sede', label: 'Sede', type: 'text', maxLength: 120 },
      { key: 'livello', label: 'Livello', type: 'text', required: true, maxLength: 60, helpText: 'Es. triennale, magistrale, semestre-filtro.' },
      { key: 'annoCorso', label: 'Anno di corso', type: 'text', maxLength: 30, helpText: 'Es. 1° anno, 2° anno.' },
      { key: 'annoAccademico', label: 'Anno accademico', type: 'text', maxLength: 20, helpText: 'Es. 2026/2027.' },
      { key: 'insegnamento', label: 'Insegnamento / ambito', type: 'text', maxLength: 120 },
      {
        key: 'tipoGruppo', label: 'Tipo di gruppo', type: 'select', default: 'gruppo',
        options: [
          { value: 'gruppo', label: 'Gruppo WhatsApp' },
          { value: 'community', label: 'Community WhatsApp' },
          { value: 'canale', label: 'Canale WhatsApp' },
          { value: 'broadcast', label: 'Lista broadcast' },
          { value: 'link-esterno', label: 'Link esterno alternativo' },
          { value: 'temporaneo', label: 'Temporaneo (evento/iniziativa)' },
        ],
      },
      { key: 'tipologia', label: 'Tipologia (contesto libero)', type: 'text', required: true, maxLength: 60, helpText: 'Es. semestre-filtro, tirocinio, matricole 2026.' },
      { key: 'pubblico', label: 'Pubblico di riferimento', type: 'text', maxLength: 120 },
      { key: 'link', label: 'Link WhatsApp', type: 'whatsapp-link', required: true, maxLength: 300, helpText: 'Solo chat.whatsapp.com o whatsapp.com/channel. Nessuna verifica automatica del gruppo: solo del formato.' },
      { key: 'linkVerificatoIl', label: 'Link verificato il', type: 'date', helpText: 'Aggiorna manualmente dopo aver controllato che il link funzioni ancora.' },
      { key: 'qrCode', label: 'QR personalizzato (percorso immagine già presente nel repo)', type: 'text', maxLength: 300, helpText: 'Lasciare vuoto per generare automaticamente il QR dal link.' },
      { key: 'qrAltText', label: 'Testo alternativo QR code', type: 'text', maxLength: 200 },
      { key: 'copertina', label: 'Copertina (percorso immagine già presente nel repo)', type: 'text', maxLength: 300 },
      { key: 'referente', label: 'Referente', type: 'text', maxLength: 120 },
      { key: 'contattoReferente', label: 'Contatto del referente', type: 'text', maxLength: 200 },
      { key: 'noteInterne', label: 'Note interne (mai pubbliche)', type: 'textarea', maxLength: 1000 },
      { key: 'seoTitle', label: 'SEO title', type: 'text', maxLength: 70 },
      { key: 'seoDescription', label: 'SEO description', type: 'textarea', maxLength: 160 },
      { key: 'dataApertura', label: 'Data apertura', type: 'date' },
      { key: 'dataScadenza', label: 'Data scadenza', type: 'date' },
      { key: 'inEvidenza', label: 'In evidenza in homepage', type: 'boolean' },
      { key: 'ordine', label: 'Ordine', type: 'number', default: 99 },
      { key: 'stato', label: 'Stato', type: 'select', default: 'draft', options: STATO_OPTIONS },
      ...SCHEDULING_FIELDS,
    ],
  },
};

export function getContentType(tipo: string): ContentTypeDef | undefined {
  return CONTENT_TYPES[tipo];
}
