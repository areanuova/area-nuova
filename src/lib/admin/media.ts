// Helpers puri per la media library (Sprint 5.0B, Fase 2). Separati dalle
// route API per essere testabili senza Astro/Supabase, stesso principio di
// content-utils.ts.

export const MEDIA_BUCKET = 'cms-media';

export const MIME_ESTENSIONE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export const MIME_CONSENTITI = Object.keys(MIME_ESTENSIONE);
export const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB, coerente con il limite del bucket

/** Nome file normalizzato: minuscolo, solo [a-z0-9-], estensione dal MIME (mai dal nome originale, non fidato). */
export function normalizzaNomeFile(nomeOriginale: string, mimeType: string): string {
  const base = nomeOriginale
    .replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file';
  const ext = MIME_ESTENSIONE[mimeType] ?? 'bin';
  return `${base}.${ext}`;
}

/** Percorso nel bucket: cartellato per anno/mese, con un prefisso random anti-collisione. */
export function percorsoStorage(nomeFile: string): string {
  const now = new Date();
  const anno = now.getFullYear();
  const mese = String(now.getMonth() + 1).padStart(2, '0');
  const prefisso = crypto.randomUUID().slice(0, 8);
  return `${anno}/${mese}/${prefisso}-${nomeFile}`;
}

export function isPostgrestTabellaAssente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  // '42P01' = codice Postgres grezzo ("relation does not exist"); 'PGRST205'
  // = codice PostgREST quando la tabella non è nella cache dello schema
  // (osservato realmente in produzione: "Could not find the table
  // 'public.cms_media' in the schema cache" — messaggio diverso da quello
  // Postgres grezzo, va riconosciuto esplicitamente e non solo dedotto).
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist/i.test(error.message ?? '') ||
    /could not find the table/i.test(error.message ?? '')
  );
}
