// Validazione server-side del form Partnership. Campi allineati 1:1 allo
// schema Zod reale in src/content/config.ts (collection `partnership`) —
// nessun campo aggiunto che non esista già lì.
//
// Le funzioni pure (slug, path, generazione frontmatter) vivono in
// content-utils.ts, senza dipendenza da Zod/Astro, così da restare
// testabili con un semplice script Node — qui le ri-esportiamo per
// comodità di chi importa da questo modulo.

import { z } from 'astro:content';
import type { ContentStato } from './roles';
import {
  PARTNERSHIP_COLLECTION_DIR,
  isSafeUrl,
  slugify,
  isSafeSlug,
  contentFilePath,
  generateFrontmatter,
} from './content-utils';

export { PARTNERSHIP_COLLECTION_DIR, isSafeUrl, slugify, isSafeSlug, contentFilePath, generateFrontmatter };

// Stesso schema di src/content/config.ts, con l'aggiunta di `slug` (non è
// un campo di frontmatter: determina il nome del file).
export const partnershipFormSchema = z.object({
  slug: z
    .string()
    .min(2, 'Lo slug deve avere almeno 2 caratteri')
    .max(80, 'Lo slug è troppo lungo (max 80 caratteri)')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug non valido: solo lettere minuscole, numeri e trattini singoli'),
  nome: z.string().min(2, 'Il nome è obbligatorio').max(120),
  categoria: z.string().max(60).default('Generale'),
  descrizione: z.string().min(10, 'La descrizione è obbligatoria (min 10 caratteri)').max(500),
  codice: z.string().max(60).optional().or(z.literal('')),
  vantaggi: z.array(z.string().max(200)).max(20).default([]),
  validita: z.string().max(120).optional().or(z.literal('')),
  spedizione: z.string().max(120).optional().or(z.literal('')),
  link: z
    .string()
    .max(300)
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || isSafeUrl(v), 'Link non valido: deve iniziare con https://'),
  logo: z.string().max(300).optional().or(z.literal('')),
  ordine: z.coerce.number().int().min(0).max(999).default(99),
  stato: z.enum(['draft', 'review', 'published', 'archived'] as [ContentStato, ...ContentStato[]]).default('draft'),
  corpo: z.string().max(5000).optional().or(z.literal('')),
});

export type PartnershipForm = z.infer<typeof partnershipFormSchema>;
