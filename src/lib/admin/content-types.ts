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
  | 'select';

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
        helpText: 'Es. /images/news/copertina.jpg. Il pannello non carica nuovi file: lasciare vuoto o riusare un percorso già esistente.',
      },
      { key: 'stato', label: 'Stato', type: 'select', default: 'draft', options: STATO_OPTIONS },
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
        helpText: 'Es. /documenti/modulo.pdf oppure un URL esterno completo. Il pannello non carica nuovi file.',
      },
      { key: 'descrizione', label: 'Descrizione', type: 'textarea', maxLength: 500 },
      { key: 'stato', label: 'Stato', type: 'select', default: 'draft', options: STATO_OPTIONS },
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
        helpText: 'Es. /images/progetti/copertina.jpg. Il pannello non carica nuovi file: lasciare vuoto o riusare un percorso già esistente.',
      },
      { key: 'inEvidenza', label: 'In evidenza', type: 'boolean' },
      { key: 'statoPubblicazione', label: 'Stato pubblicazione', type: 'select', default: 'draft', options: STATO_OPTIONS },
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
    ],
  },
};

export function getContentType(tipo: string): ContentTypeDef | undefined {
  return CONTENT_TYPES[tipo];
}
