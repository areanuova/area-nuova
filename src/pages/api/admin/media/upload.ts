// POST /api/admin/media/upload — carica un file nella media library
// (Sprint 5.0B, Fase 2). multipart/form-data: campo "file" obbligatorio,
// "altText"/"caption" opzionali. Upload sempre server-side con la service
// role key (mai un upload diretto dal client come in alloggi/pubblica.astro
// — qui il bucket non è pensato per scritture anonime, solo per l'admin
// autenticato), poi una riga in cms_media per ricerca/filtri/stato d'uso.
export const prerender = false;

import type { APIContext } from 'astro';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { hasPermission } from '../../../../lib/admin/roles';
import { getAdminSupabase } from '../../../../lib/aris/supabase-admin';
import { logAuditEvent } from '../../../../lib/admin/audit';
import { withErrorHandling } from '../../../../lib/admin/api-handler';
import { MEDIA_BUCKET, MIME_CONSENTITI, MAX_FILE_SIZE, normalizzaNomeFile, percorsoStorage, isPostgrestTabellaAssente } from '../../../../lib/admin/media';

export const POST = withErrorHandling(async ({ request }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
  if (!hasPermission(auth.user.role, 'media.manage', auth.user.permessiExtra)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File)) {
    return Response.json({ error: 'file_mancante' }, { status: 400 });
  }
  if (!MIME_CONSENTITI.includes(file.type)) {
    return Response.json({ error: 'formato_non_consentito', message: `Formato "${file.type}" non consentito.` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: 'file_troppo_grande', message: 'Il file supera i 15 MB consentiti.' }, { status: 400 });
  }

  const altText = String(form.get('altText') ?? '').slice(0, 300) || null;
  const caption = String(form.get('caption') ?? '').slice(0, 500) || null;

  const filename = normalizzaNomeFile(file.name, file.type);
  const path = percorsoStorage(filename);

  const sb = getAdminSupabase();

  const { error: uploadError } = await sb.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) {
    return Response.json({ error: 'upload_fallito', message: uploadError.message }, { status: 502 });
  }

  const { data: urlData } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path);

  const { data: row, error: dbError } = await sb
    .from('cms_media')
    .insert({
      path, filename, mime_type: file.type, size_bytes: file.size,
      alt_text: altText, caption, uploaded_by: auth.user.id,
    })
    .select()
    .single();

  if (dbError) {
    if (isPostgrestTabellaAssente(dbError)) {
      // File già caricato con successo nello Storage: non lo rimuoviamo (lo
      // spreco di uno storage object orfano è meno grave di un rollback che
      // fallisce silenziosamente) — segnaliamo esplicitamente lo stato reale.
      return Response.json({
        ok: true, path, url: urlData.publicUrl,
        avviso: 'File caricato nello Storage, ma non tracciato: la tabella cms_media non esiste ancora (migration Sprint 5.0B non applicata).',
      });
    }
    return Response.json({ error: 'db_write_failed', message: dbError.message }, { status: 502 });
  }

  await logAuditEvent({
    utente: auth.user, azione: 'media_upload', collezione: 'media', entryId: path,
    dettagli: { filename, mimeType: file.type, sizeBytes: file.size },
  });

  return Response.json({ ok: true, media: row, url: urlData.publicUrl });
});
