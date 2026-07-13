// Impostazioni del sito (Sprint 5.0B, Fase 9) — git-backed come ogni altro
// contenuto CMS: nessuna nuova tabella, il file esisteva già
// (src/data/sito.json, letto da Footer/Navbar/BaseLayout) e ora diventa
// anche scrivibile dal pannello via commitContentFile (eccezione esplicita
// nel path allow-list, vedi github.ts). Zod qui garantisce che un salvataggio
// dal form non possa mai produrre un JSON che rompe le pagine pubbliche che
// lo importano staticamente.
import { z } from 'astro:content';

export const SITO_JSON_PATH = 'src/data/sito.json';

export const SettingsSchema = z.object({
  nome: z.string().min(1).max(80),
  slogan: z.string().max(200).default(''),
  descrizione: z.string().min(1).max(300),
  email: z.string().email(),
  telefono: z.string().max(40).default(''),
  indirizzo: z.string().max(200).default(''),
  cittaUniversita: z.string().max(120).default(''),
  social: z.object({
    instagram: z.string().max(300).default(''),
    facebook: z.string().max(300).default(''),
    telegram: z.string().max(300).default(''),
    youtube: z.string().max(300).default(''),
    whatsapp: z.string().max(300).default(''),
  }),
  form: z.object({
    segnalazioni: z.string().max(500).default(''),
    entra: z.string().max(500).default(''),
  }),
  banner: z.object({
    attivo: z.boolean().default(false),
    messaggio: z.string().max(300).default(''),
    link: z.string().max(300).default(''),
  }),
  manutenzione: z.object({
    attiva: z.boolean().default(false),
    messaggio: z.string().max(300).default(''),
  }),
});

export type SiteSettings = z.infer<typeof SettingsSchema>;

/** Serializzazione deterministica, stessa filosofia di content-utils.ts. */
export function serializeSettings(settings: SiteSettings): string {
  return JSON.stringify(settings, null, 2) + '\n';
}
