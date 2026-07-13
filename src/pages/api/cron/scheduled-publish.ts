// GET/POST /api/cron/scheduled-publish — pianificazione automatica
// (Sprint 5.0B, Fase 7). Esegue le transizioni draft/review→published e
// published→archived per i contenuti generici con pubblicaIl/archiviaIl
// nel passato. Registrato in vercel.json con cadenza GIORNALIERA — non più
// frequente: è il limite reale della cadenza cron disponibile in questo
// ambiente (stesso vincolo già osservato per /api/aris/sync-external, unico
// altro cron esistente). Non dichiarato "in tempo reale" in nessun punto
// dell'interfaccia proprio per questo — solo "entro il prossimo passaggio
// giornaliero" (vedi content-types.ts, SCHEDULING_FIELDS).
//
// Idempotente per costruzione: dopo aver spostato un contenuto a
// "published"/"archived", una nuova esecuzione lo trova già nello stato
// target e non lo tocca più — nessun flag "già eseguito" da mantenere.
export const prerender = false;

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { getAdminSupabase } from '../../../lib/aris/supabase-admin';
import { commitContentFile, isGithubConfigured } from '../../../lib/admin/github';
import { contentFilePathGeneric, generateFrontmatterGeneric } from '../../../lib/admin/content-utils';
import { CONTENT_TYPES } from '../../../lib/admin/content-types';

const COLLEZIONI_PIANIFICABILI = ['news', 'guide', 'documenti', 'progetti', 'video', 'gruppi-whatsapp'] as const;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('Authorization') ?? '';
  const cronSecret = import.meta.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const adminKey = import.meta.env.ARIS_ADMIN_KEY;
  if (adminKey && auth === `Bearer ${adminKey}`) return true;
  return false;
}

async function logSistemaAudit(azione: string, collezione: string, entryId: string, dettagli: Record<string, unknown>) {
  try {
    const sb = getAdminSupabase();
    await sb.from('cms_audit_log').insert({ admin_id: null, azione, collezione, entry_id: entryId, dettagli: { sistema: true, ...dettagli } });
  } catch {
    // stessa filosofia di audit.ts: l'audit non deve mai far fallire l'operazione principale.
  }
}

async function eseguiPianificazione(): Promise<Response> {
  if (!isGithubConfigured()) {
    return Response.json({ ok: false, motivo: 'github_non_configurato' }, { status: 200 });
  }

  const ora = new Date();
  const risultati: Array<{ collezione: string; slug: string; transizione: string; esito: 'ok' | 'errore'; dettaglio?: string }> = [];

  for (const tipo of COLLEZIONI_PIANIFICABILI) {
    const typeDef = CONTENT_TYPES[tipo];
    const entries = await getCollection(tipo as any);

    for (const entry of entries as any[]) {
      const statoField = typeDef.statoField;
      const statoAttuale = entry.data[statoField] as string;
      const pubblicaIl = entry.data.pubblicaIl as Date | undefined;
      const archiviaIl = entry.data.archiviaIl as Date | undefined;

      let nuovoStato: string | null = null;
      if (pubblicaIl && pubblicaIl <= ora && (statoAttuale === 'draft' || statoAttuale === 'review')) {
        nuovoStato = 'published';
      } else if (archiviaIl && archiviaIl <= ora && statoAttuale === 'published') {
        nuovoStato = 'archived';
      }
      if (!nuovoStato) continue;

      try {
        const path = contentFilePathGeneric(typeDef.collectionDir, entry.slug);
        const fieldOrder = typeDef.fields.map((f) => f.key);
        const values: Record<string, any> = { ...entry.data, [statoField]: nuovoStato };
        const frontmatter = generateFrontmatterGeneric(fieldOrder, values, typeDef.hasBody ? entry.body : undefined);

        const commit = await commitContentFile({
          path,
          content: frontmatter,
          message: `Pianificazione automatica: ${entry.slug} → ${nuovoStato} (cron)`,
        });

        await logSistemaAudit('schedule_run', typeDef.collection, entry.slug, {
          statoPrecedente: statoAttuale, statoNuovo: nuovoStato, commitSha: commit.commitSha,
        });
        risultati.push({ collezione: tipo, slug: entry.slug, transizione: `${statoAttuale}→${nuovoStato}`, esito: 'ok' });
      } catch (err) {
        const dettaglio = String((err as Error)?.message ?? err);
        await logSistemaAudit('error', typeDef.collection, entry.slug, { motivo: dettaglio, contesto: 'schedule_run' });
        risultati.push({ collezione: tipo, slug: entry.slug, transizione: `${statoAttuale}→${nuovoStato}`, esito: 'errore', dettaglio });
      }
    }
  }

  return Response.json({
    ok: true,
    eseguitiIl: ora.toISOString(),
    totaleTransizioni: risultati.length,
    risultati,
  });
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return await eseguiPianificazione();
  } catch (err) {
    console.error('[scheduled-publish]', err);
    return Response.json({ error: 'internal_error', message: String((err as Error)?.message ?? err) }, { status: 500 });
  }
}

export function GET(ctx: APIContext): Promise<Response> { return handle(ctx.request); }
export function POST(ctx: APIContext): Promise<Response> { return handle(ctx.request); }
