// Funzioni pure (nessuna dipendenza da Zod/Astro) per slug, path e
// generazione frontmatter. Separate da validation.ts apposta: questo file
// è importabile da un semplice script Node (scripts/verify-cms-sprint3.mjs)
// senza passare dal resolver Vite di 'astro:content'.

export const PARTNERSHIP_COLLECTION_DIR = 'src/content/partnership';

export type ContentStato = 'draft' | 'review' | 'published' | 'archived';

/** Sottoinsieme dei campi del form necessario per generare il frontmatter — niente Zod qui. */
export interface PartnershipFrontmatterInput {
  nome: string;
  categoria: string;
  descrizione: string;
  codice?: string;
  vantaggi: string[];
  validita?: string;
  spedizione?: string;
  link?: string;
  logo?: string;
  ordine: number;
  stato: ContentStato;
  corpo?: string;
}

/** Rifiuta esplicitamente javascript:/data:/altri schemi pericolosi — solo https:// è ammesso. */
export function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Converte una stringa libera in uno slug sicuro. Usata sia per proporre
 * uno slug dal nome, sia come seconda linea di difesa indipendente dalla
 * regex dello schema Zod prima di comporre un path su disco/GitHub.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove accenti (segni diacritici combinanti)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** true solo se lo slug è sicuro da usare in un path di file — anti path-traversal. */
export function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && !slug.includes('..') && slug.length >= 2 && slug.length <= 80;
}

/** Path del file per uno slug, con verifica che resti dentro la directory della collection. */
export function contentFilePath(slug: string): string {
  if (!isSafeSlug(slug)) throw new Error(`Slug non sicuro: ${slug}`);
  const path = `${PARTNERSHIP_COLLECTION_DIR}/${slug}.md`;
  if (!path.startsWith(`${PARTNERSHIP_COLLECTION_DIR}/`) || path.includes('..')) {
    throw new Error('Percorso file risultante non valido.');
  }
  return path;
}

function yamlString(value: string): string {
  // Quota sempre in stile YAML "double quoted" se la stringa contiene
  // caratteri che altrimenti la renderebbero ambigua; altrimenti la lascia
  // semplice per restare coerente con lo stile del resto del repository.
  const needsQuoting = /[:#\-\[\]{}"'|>*&!%@`\n]/.test(value) || value.trim() !== value || value === '';
  if (!needsQuoting) return value;
  return JSON.stringify(value); // JSON string escaping è un sottoinsieme valido di YAML double-quoted
}

function yamlStringArray(values: string[]): string {
  if (values.length === 0) return '[]';
  return '\n' + values.map((v) => `  - ${yamlString(v)}`).join('\n');
}

/**
 * Genera il frontmatter + corpo Markdown in modo deterministico: stesso
 * input produce sempre stesso output byte-per-byte (nessun timestamp
 * implicito, nessun ordine di chiavi variabile) — importante per diff
 * leggibili nei commit e per i test di verifica.
 */
export function generateFrontmatter(form: PartnershipFrontmatterInput): string {
  const righe: string[] = ['---'];
  righe.push(`nome: ${yamlString(form.nome)}`);
  righe.push(`categoria: ${yamlString(form.categoria || 'Generale')}`);
  righe.push(`descrizione: ${yamlString(form.descrizione)}`);
  if (form.codice) righe.push(`codice: ${yamlString(form.codice)}`);
  righe.push(`vantaggi: ${yamlStringArray(form.vantaggi ?? [])}`);
  if (form.validita) righe.push(`validita: ${yamlString(form.validita)}`);
  if (form.spedizione) righe.push(`spedizione: ${yamlString(form.spedizione)}`);
  if (form.link) righe.push(`link: ${yamlString(form.link)}`);
  if (form.logo) righe.push(`logo: ${yamlString(form.logo)}`);
  righe.push(`stato: ${form.stato}`);
  righe.push(`ordine: ${form.ordine}`);
  righe.push('---');
  righe.push('');
  if (form.corpo) righe.push(form.corpo.trim());
  righe.push('');
  return righe.join('\n');
}

// ============================================================
// Generico (Sprint 4.0) — usato da News/Guide/Documenti/Progetti/Video
// tramite il registro in content-types.ts. Partnership resta sul percorso
// dedicato sopra, non toccato: già verificato end-to-end in produzione.
// ============================================================

/** Path del file per una collection/slug generici, con lo stesso controllo anti path-traversal. */
export function contentFilePathGeneric(collectionDir: string, slug: string): string {
  if (!isSafeSlug(slug)) throw new Error(`Slug non sicuro: ${slug}`);
  const path = `${collectionDir}/${slug}.md`;
  if (!path.startsWith(`${collectionDir}/`) || path.includes('..')) {
    throw new Error('Percorso file risultante non valido.');
  }
  return path;
}

export type GenericFieldValue = string | number | boolean | string[] | undefined;

/**
 * Genera frontmatter generico da una lista ordinata di chiavi e una mappa
 * di valori. Stesso principio di determinismo di generateFrontmatter:
 * campi stringa opzionali vuoti omessi, array/boolean/number sempre
 * scritti (hanno un valore definito anche a "vuoto"/false/0).
 */
export function generateFrontmatterGeneric(
  fieldOrder: string[],
  values: Record<string, GenericFieldValue>,
  corpo?: string,
): string {
  const righe: string[] = ['---'];
  for (const key of fieldOrder) {
    const v = values[key];
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      righe.push(`${key}: ${yamlStringArray(v)}`);
    } else if (typeof v === 'boolean' || typeof v === 'number') {
      righe.push(`${key}: ${v}`);
    } else if (v !== '') {
      righe.push(`${key}: ${yamlString(v)}`);
    }
  }
  righe.push('---');
  righe.push('');
  if (corpo) righe.push(corpo.trim());
  righe.push('');
  return righe.join('\n');
}
