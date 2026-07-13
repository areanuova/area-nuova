// POST /api/admin/contenuti/{tipo}/restore — ripristina un contenuto a una
// revisione precedente (Sprint 5.0B, Fase 6). Il contenuto della revisione
// storica viene ricommittato AS-IS come nuovo commit: mai una riscrittura
// della cronologia Git, mai un force-push. Riservato a admin/super_admin
// (stesso minimo di canPublishContent), con conferma esplicita obbligatoria
// nel body — nessun ripristino "silenzioso".
export const prerender = false;

import type { APIContext } from 'astro';
import { requireAdminUser } from '../../../../../lib/admin/auth-server';
import { canPublishContent } from '../../../../../lib/admin/roles';
import { logAuditEvent } from '../../../../../lib/admin/audit';
import { getContentType } from '../../../../../lib/admin/content-types';
import { contentFilePathGeneric } from '../../../../../lib/admin/content-utils';
import { getFileAtRef, commitContentFile } from '../../../../../lib/admin/github';
import { withErrorHandling } from '../../../../../lib/admin/api-handler';

export const POST = withErrorHandling(async ({ request, params }: APIContext): Promise<Response> => {
  const typeDef = getContentType(params.tipo ?? '');
  if (!typeDef) return Response.json({ error: 'unknown_content_type' }, { status: 404 });

  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
  if (!canPublishContent(auth.user.role)) {
    return Response.json({ error: 'forbidden', message: 'Solo admin o super admin possono ripristinare una revisione.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { slug?: string; sha?: string; confirm?: boolean } | null;
  if (!body?.slug || !body?.sha || body.confirm !== true) {
    return Response.json({ error: 'invalid_request', message: 'slug, sha e confirm:true sono obbligatori.' }, { status: 400 });
  }

  let path: string;
  try {
    path = contentFilePathGeneric(typeDef.collectionDir, body.slug);
  } catch (err) {
    return Response.json({ error: 'invalid_slug', message: String((err as Error).message) }, { status: 400 });
  }

  try {
    const contenutoStorico = await getFileAtRef(path, body.sha);
    const commit = await commitContentFile({
      path,
      content: contenutoStorico,
      message: `Ripristina "${body.slug}" alla revisione ${body.sha.slice(0, 7)} via pannello admin`,
    });

    await logAuditEvent({
      utente: auth.user,
      azione: 'restore_version',
      collezione: typeDef.collection,
      entryId: body.slug,
      dettagli: { revisioneRipristinata: body.sha, nuovoCommit: commit.commitSha },
    });

    return Response.json({ ok: true, commit });
  } catch (err) {
    return Response.json({ error: 'restore_failed', message: String((err as Error).message) }, { status: 502 });
  }
});
