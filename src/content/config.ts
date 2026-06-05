import { defineCollection, z } from 'astro:content';

// SCHEDE DEI RAPPRESENTANTI
const rappresentanti = defineCollection({
  type: 'content',
  schema: ({ image }) =>
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
    tipo: z.enum(['modulo', 'mozione', 'documento']),
    categoria: z.string().default('Generale'),
    anno: z.number(),
    // percorso del file dentro /public (es. /documenti/modulo.pdf) oppure URL esterno
    file: z.string(),
    descrizione: z.string().optional(),
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
};
