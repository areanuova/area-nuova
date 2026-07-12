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
      bozza: z.boolean().default(false),
      categoria: z.enum(['comunicato', 'risultati', 'resoconto', 'avviso']).default('comunicato'),
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
  }),
});

// GRUPPI WHATSAPP UNIFG
const gruppiWhatsapp = defineCollection({
  type: 'content',
  schema: z.object({
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
    attiva: z.boolean().default(true),
    ordine: z.number().default(99),
  }),
});

// VIDEO (canale YouTube Area Nuova)
const video = defineCollection({
  type: 'content',
  schema: z.object({
    titolo: z.string(),
    descrizione: z.string().optional(),
    youtubeId: z.string().optional(),
    data: z.coerce.date(),
    inEvidenza: z.boolean().default(false),
    ordine: z.number().default(99),
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
