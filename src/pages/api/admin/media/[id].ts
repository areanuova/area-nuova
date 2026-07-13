// PATCH/DELETE /api/admin/media/{id} — modifica metadati (alt/caption/nome)
// o elimina un file dalla media library (Sprint 5.0B, Fase 2). DELETE
// verifica sempre lato server che il file non risulti referenziato in
// nessun contenuto prima di procedere — mai un'eliminazione che rompa
// un'immagine già in uso, indipendentemente da cosa mostri la UI.
export const prerender = false;

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { hasPermission } from '../../../../lib/admin/roles';
import { getAdminSupabase } from '../../../../lib/aris/supabase-admin';
import { logAuditEvent } from '../../../../lib/admin/audit';
import { withErrorHandling } from '../../../../lib/admin/api-handler';
import { MEDIA_BUCKET } from '../../../../lib/admin/media';

const COLLEZIONI_DA_SCANSIONARE = [
  'news', 'guide', 'documenti', 'progetti', 'video', 'gruppi-whatsapp',
  'partnership', 'convenzioni', 'rappresentanti', 'eventi',
] as const;

async function pathInUso(path: string): Promise<boolean> {
  for (const collezione of COLLEZIONI_DA_SCANSIONARE) {
    try {
      const entries = await getCollection(collezione as any);
      for (const e of entries as any[]) {
        if (JSON.stringify(e.data).includes(path)) return true;
      }
    } catch { /* non bloccante */ }
  }
  return false;
}

export const PATCH = withErrorHandling(async ({ request, params }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
  if (!hasPermission(auth.user.role, 'media.manage', auth.user.permessiExtra)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { altText?: string; caption?: string; filename?: string } | null;
  if (!body) return Response.json({ error: 'invalid_json' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.altText === 'string') patch.alt_text = body.altText.slice(0, 300);
  if (typeof body.caption === 'string') patch.caption = body.caption.slice(0, 500);
  if (typeof body.filename === 'string' && body.filename.trim()) patch.filename = body.filename.trim().slice(0, 150);

  const sb = getAdminSupabase();
  const { data, error } = await sb.from('cms_media').update(patch).eq('id', params.id).select().single();
  if (error) return Response.json({ error: 'db_update_failed', message: error.message }, { status: 502 });

  await logAuditEvent({ utente: auth.user, azione: 'update', collezione: 'media', entryId: params.id ?? '', dettagli: { campiModificati: Object.keys(patch) } });
  return Response.json({ ok: true, media: data });
});

export const DELETE = withErrorHandling(async ({ request, params }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
  if (!hasPermission(auth.user.role, 'media.manage', auth.user.permessiExtra)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const sb = getAdminSupabase();
  const { data: media, error: readError } = await sb.from('cms_media').select('*').eq('id', params.id).single();
  if (readError || !media) return Response.json({ error: 'not_found' }, { status: 404 });

  if (await pathInUso(media.path)) {
    return Response.json({ error: 'file_in_uso', message: 'Questo file risulta referenziato in almeno un contenuto pubblicato: non può essere eliminato finché resta in uso.' }, { status: 409 });
  }

  const { error: storageError } = await sb.storage.from(MEDIA_BUCKET).remove([media.path]);
  if (storageError) return Response.json({ error: 'storage_delete_failed', message: storageError.message }, { status: 502 });

  const { error: dbError } = await sb.from('cms_media').delete().eq('id', params.id);
  if (dbError) return Response.json({ error: 'db_delete_failed', message: dbError.message }, { status: 502 });

  await logAuditEvent({ utente: auth.user, azione: 'media_delete', collezione: 'media', entryId: media.path, dettagli: { filename: media.filename } });
  return Response.json({ ok: true });
});
