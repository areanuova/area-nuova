// GET/POST /api/admin/settings — impostazioni del sito (Sprint 5.0B, Fase 9).
// Stesso principio delle altre route CMS: lettura dallo snapshot
// dell'ultimo deploy (import statico, bundlato a build time), scrittura via
// commit GitHub. Riservato a super_admin: contatti, social e banner
// sitewide non sono contenuto editoriale ordinario.
export const prerender = false;

import type { APIContext } from 'astro';
import { requireAdminUser } from '../../../lib/admin/auth-server';
import { hasPermission } from '../../../lib/admin/roles';
import { withErrorHandling } from '../../../lib/admin/api-handler';
import { commitContentFile } from '../../../lib/admin/github';
import { SettingsSchema, serializeSettings, SITO_JSON_PATH } from '../../../lib/admin/settings';
import { logAuditEvent } from '../../../lib/admin/audit';
import sitoAttuale from '../../../data/sito.json';

export const GET = withErrorHandling(async ({ request }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
  if (!hasPermission(auth.user.role, 'settings.manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  return Response.json({
    impostazioni: sitoAttuale,
    nota: 'Lette dallo snapshot dell\'ultimo deploy. In produzione riflettono le modifiche solo dopo il prossimo deploy innescato dal commit su GitHub.',
  });
});

export const POST = withErrorHandling(async ({ request }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
  if (!hasPermission(auth.user.role, 'settings.manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: 'invalid_json' }, { status: 400 });

  const risultato = SettingsSchema.safeParse(body);
  if (!risultato.success) {
    return Response.json({ error: 'validation_failed', dettagli: risultato.error.flatten() }, { status: 400 });
  }

  const commit = await commitContentFile({
    path: SITO_JSON_PATH,
    content: serializeSettings(risultato.data),
    message: `Aggiorna impostazioni del sito via pannello admin`,
  });

  await logAuditEvent({
    utente: auth.user,
    azione: 'update',
    collezione: 'impostazioni',
    entryId: 'sito',
    dettagli: { commitSha: commit.commitSha },
  });

  return Response.json({ ok: true, commit });
});
