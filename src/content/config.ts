import { defineCollection, z } from 'astro:content';

// SCHEDE DEI RAPPRESENTANTI
const rappresentanti = defineCollection({
  type: 'content',
  schema: () =>
    z.object({
      nome: z.string(),
      ruolo: z.string(),
      // organo di rappresentanza
    organo: z.enum(['senato', 'cda', 'csu', 'nucleo', 'adisu', 'dipartimento', 'corso']),
      dipartimento: z.string().optional(),
    foto: z.string().optional(),
      email: z.string().email().optional(),
      ordine: z.number().default(99),
      attivo: z.boolean().default(true),
    }),
});

// ARCHIVIO PROGETTI
const progetti = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      titolo: z.string(),
      descrizione: z.string(),
      stato: z.enum(['attivo', 'concluso']),
      categoria: z.string().default('Generale'),
      dataInizio: z.coerce.date(),
      dataFine: z.coerce.date().optional(),
      copertina: image().optional(),
      inEvidenza: z.boolean().default(false),
      // CMS Sprint 4.0: workflow di pubblicazione (draft/review/published/
      // archived) — campo separato da `stato` sopra, che ha un significato
      // diverso e preesistente (ciclo di vita del progetto, non pubblicazione).
      // Default 'published' perché ogni progetto già esistente, privo del
      // campo, deve restare visibile invariato.
      statoPubblicazione: z.enum(['draft', 'review', 'published', 'archived']).default('published'),
      // Sprint 5.0B (Fase 7): pianificazione. Letti solo dal cron
      // /api/cron/scheduled-publish, mai dalle pagine pubbliche (che
      // continuano a fidarsi esclusivamente di `statoPubblicazione`).
      pubblicaIl: z.coerce.date().optional(),
      archiviaIl: z.coerce.date().optional(),
    }),
});

// ARCHIVIO RISULTATI OTTENUTI
const risultati = defineCollection({
  type: 'content',
  schema: z.object({
    titolo: z.string(),
    descrizione: z.string(),
    data: z.coerce.date(),
    categoria: z.string().default('Generale'),
    progettoCollegato: z.string().optional(),
  }),
});

// NEWS
const news = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      titolo: z.string(),
      data: z.coerce.date(),
      autore: z.string().optional(),
      copertina: image().optional(),
      tag: z.array(z.string()).default([]),
      estratto: z.string(),
      // `bozza` è il flag storico (pre-CMS): mantenuto per compatibilità,
      // non più letto dalle pagine pubbliche dallo Sprint 4.0 in poi — il
      // nuovo campo `stato` è l'unica fonte di verità per la visibilità
      // pubblica (stesso trattamento di `attiva` in partnership).
      bozza: z.boolean().default(false),
      categoria: z.enum(['comunicato', 'risultati', 'resoconto', 'avviso']).default('comunicato'),
      stato: z.enum(['draft', 'review', 'published', 'archived']).default('published'),
      // Sprint 5.0B (Fase 7): pianificazione. Letti solo dal cron
      // /api/cron/scheduled-publish, mai dalle pagine pubbliche (che
      // continuano a fidarsi esclusivamente di `stato`).
      pubblicaIl: z.coerce.date().optional(),
      archiviaIl: z.coerce.date().optional(),
    }),
});

// EVENTI
const eventi = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      titolo: z.string(),
      data: z.coerce.date(),
      oraInizio: z.string().optional(),
      oraFine: z.string().optional(),
      luogo: z.string(),
      descrizione: z.string(),
      categoria: z.enum(['assemblea', 'orientamento', 'formazione', 'culturale', 'altro']).default('altro'),
      copertina: image().optional(),
      inEvidenza: z.boolean().default(false),
      linkIscrizione: z.string().url().optional(),
    }),
});

// GUIDE UTILI (con flag matricole)
const guide = defineCollection({
  type: 'content',
  schema: z.object({
    titolo: z.string(),
    categoria: z.string().default('Generale'),
    perMatricole: z.boolean().default(false),
    ordine: z.number().default(99),
    estratto: z.string().optional(),
    stato: z.enum(['draft', 'review', 'published', 'archived']).default('published'),
    // Sprint 5.0B (Fase 7): pianificazione. Letti solo dal cron
    // /api/cron/scheduled-publish, mai dalle pagine pubbliche (che
    // continuano a fidarsi esclusivamente di `stato`).
    pubblicaIl: z.coerce.date().optional(),
    archiviaIl: z.coerce.date().optional(),
  }),
});

// MODULISTICA + MOZIONI/DOCUMENTI
const documenti = defineCollection({
  type: 'content',
  schema: z.object({
    titolo: z.string(),
    tipo: z.enum(['modulo', 'mozione', 'documento', 'proposta', 'richiesta']),
    categoria: z.string().default('Generale'),
    anno: z.number(),
    // percorso del file dentro /public (es. /documenti/modulo.pdf) oppure URL esterno
    file: z.string(),
    descrizione: z.string().optional(),
    stato: z.enum(['draft', 'review', 'published', 'archived']).default('published'),
    // Sprint 5.0B (Fase 7): pianificazione. Letti solo dal cron
    // /api/cron/scheduled-publish, mai dalle pagine pubbliche (che
    // continuano a fidarsi esclusivamente di `stato`).
    pubblicaIl: z.coerce.date().optional(),
    archiviaIl: z.coerce.date().optional(),
  }),
});

// GRUPPI WHATSAPP UNIFG
// Sprint 5.0: schema esteso con workflow CMS e metadati completi. Tutti i
// campi nuovi sono opzionali o con default per restare compatibili con i
// contenuti già esistenti (in particolare `attivo`, mantenuto per
// compatibilità come `bozza`/`attiva` altrove — non più letto dalle pagine
// pubbliche, sostituito da `stato`).
const gruppiWhatsapp = defineCollection({
  type: 'content',
  schema: z.object({
    // --- campi storici (Sprint 2) ---
    area: z.enum([
      'medica',
      'giuridica',
      'economica',
      'umanistica',
      'agraria-ingegneria',
    ]),
    corsi: z.array(z.string()),
    livello: z.string(),
    annoAccademico: z.string().optional(),
    tipologia: z.string(),
    titolo: z.string(),
    link: z.string().url(),
    attivo: z.boolean().default(true),
    ordine: z.number().default(99),

    // --- Sprint 5.0 ---
    descrizione: z.string().optional(),
    categoria: z.string().default('Generale'),
    dipartimento: z.string().optional(),
    sede: z.string().optional(),
    annoCorso: z.string().optional(),
    insegnamento: z.string().optional(),
    // tipo di gruppo sul piano tecnico WhatsApp, distinto da `tipologia`
    // (contesto/sotto-categoria libera già in uso, es. "semestre-filtro")
    tipoGruppo: z
      .enum(['gruppo', 'community', 'canale', 'broadcast', 'link-esterno', 'temporaneo'])
      .default('gruppo'),
    pubblico: z.string().optional(),
    // percorso di un QR personalizzato caricato manualmente; se assente il
    // pannello genera il QR automaticamente dal link al momento della vista
    qrCode: z.string().optional(),
    qrAltText: z.string().optional(),
    copertina: z.string().optional(),
    inEvidenza: z.boolean().default(false),
    dataApertura: z.coerce.date().optional(),
    dataScadenza: z.coerce.date().optional(),
    referente: z.string().optional(),
    contattoReferente: z.string().optional(),
    noteInterne: z.string().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    linkVerificatoIl: z.coerce.date().optional(),
    stato: z.enum(['draft', 'review', 'published', 'archived']).default('published'),
    // Sprint 5.0B (Fase 7): pianificazione. Letti solo dal cron
    // /api/cron/scheduled-publish, mai dalle pagine pubbliche (che
    // continuano a fidarsi esclusivamente di `stato`).
    pubblicaIl: z.coerce.date().optional(),
    archiviaIl: z.coerce.date().optional(),
  }),
});

// CONVENZIONI DISCOUNT CARD
const convenzioni = defineCollection({
  type: 'content',
  schema: z.object({
    nome: z.string(),
    citta: z.string(),
    categoria: z.string(),
    tipo: z.enum(['main-sponsor', 'exclusive', 'standard', 'nuove-convenzioni']),
    offerte: z.array(z.string()).default([]),
    validaDal: z.coerce.date(),
    validaAl: z.coerce.date(),
    attiva: z.boolean().default(true),
    ordine: z.number().default(99),
    immagine: z.string().optional(),
    sitoWeb: z.string().optional(),
    instagram: z.string().optional(),
    indirizzo: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    sedi: z.array(z.object({
      nome: z.string(),
      indirizzo: z.string(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })).optional(),
  }),
});

// PARTNERSHIP AUTONOME (distinte dalla Discount Card)
const partnership = defineCollection({
  type: 'content',
  schema: z.object({
    nome: z.string(),
    categoria: z.string().default('Generale'),
    descrizione: z.string(),
    codice: z.string().optional(),
    vantaggi: z.array(z.string()).default([]),
    validita: z.string().optional(),
    spedizione: z.string().optional(),
    link: z.string().optional(),
    logo: z.string().optional(),
    // `attiva` è il flag storico (pre-CMS): mantenuto per compatibilità,
    // non più letto dalle pagine pubbliche dallo Sprint 3 in poi. Il nuovo
    // campo `stato` (introdotto dal pannello CMS, Sprint 3) è l'unica fonte
    // di verità per la visibilità pubblica. Default 'published' affinché
    // ogni contenuto esistente, privo del campo, resti visibile invariato.
    attiva: z.boolean().default(true),
    stato: z.enum(['draft', 'review', 'published', 'archived']).default('published'),
    ordine: z.number().default(99),
  }),
});

// VIDEO (canale YouTube Area Nuova)
const video = defineCollection({
  type: 'content',
  schema: z.object({
    titolo: z.string(),
    descrizione: z.string().optional(),
    // Unico campo per il riferimento YouTube (nessun url/link/embedUrl
    // duplicato): accetta ID nudo, URL completo o youtu.be — normalizzato
    // e validato server-side da src/lib/youtube.ts prima di ogni embed.
    youtubeId: z.string().optional(),
    data: z.coerce.date(),
    inEvidenza: z.boolean().default(false),
    ordine: z.number().default(99),
    stato: z.enum(['draft', 'review', 'published', 'archived']).default('published'),
    // Sprint 5.0B (Fase 7): pianificazione. Letti solo dal cron
    // /api/cron/scheduled-publish, mai dalle pagine pubbliche (che
    // continuano a fidarsi esclusivamente di `stato`).
    pubblicaIl: z.coerce.date().optional(),
    archiviaIl: z.coerce.date().optional(),
  }),
});

export const collections = {
  rappresentanti,
  progetti,
  risultati,
  news,
  eventi,
  guide,
  documenti,
  convenzioni,
  'gruppi-whatsapp': gruppiWhatsapp,
  partnership,
  video,
};
