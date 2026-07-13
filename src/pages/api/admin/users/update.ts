// POST /api/admin/users/update — cambia ruolo e/o stato attivo di un
// amministratore esistente. Solo super_admin (permesso 'users.manage').
//
// Salvaguardia deliberata: nessun super_admin può modificare la PROPRIA
// riga tramite questo endpoint (né ruolo né attivo) — elimina alla radice
// il rischio di auto-esclusione accidentale (es. disattivarsi da soli, o
// togliersi da super_admin lasciando zero account con quel ruolo). Per
// cambiare il proprio account serve un altro super_admin.
export const prerender = false;

import type { APIContext } from 'astro';
import { z } from 'astro:content';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { hasPermission, CMS_ROLES, type CmsRole } from '../../../../lib/admin/roles';
import { getAdminSupabase } from '../../../../lib/aris/supabase-admin';
import { logAuditEvent } from '../../../../lib/admin/audit';
import { withErrorHandling } from '../../../../lib/admin/api-handler';

const bodySchema = z.object({
  id: z.string().uuid(),
  role: z.enum(CMS_ROLES as [CmsRole, ...CmsRole[]]).optional(),
  attivo: z.boolean().optional(),
});

export const POST = withErrorHandling(async ({ request }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }
  if (!hasPermission(auth.user.role, 'users.manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: 'validation_error', issues: parsed.error.issues }, { status: 400 });
  }
  const { id, role, attivo } = parsed.data;
  if (role === undefined && attivo === undefined) {
    return Response.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  if (id === auth.user.id) {
    return Response.json(
      { error: 'self_modification_forbidden', message: 'Non puoi modificare ruolo o stato del tuo stesso account. Chiedi a un altro Super Admin.' },
      { status: 403 },
    );
  }

  const sb = getAdminSupabase();
  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates.role = role;
  if (attivo !== undefined) updates.attivo = attivo;

  const { data, error } = await sb.from('admin_users').update(updates).eq('id', id).select('id, email, role, attivo').maybeSingle();
  if (error) {
    return Response.json({ error: 'update_failed', message: error.message }, { status: 502 });
  }
  if (!data) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  await logAuditEvent({
    utente: auth.user,
    azione: 'update',
    collezione: 'admin_users',
    entryId: data.email,
    dettagli: { targetId: id, role, attivo },
  });

  return Response.json({ ok: true, utente: data });
});
