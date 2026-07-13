// GET /api/admin/audit/recent — attività recenti per la dashboard. Visibile
// solo a chi ha il permesso 'audit.view' (admin/super_admin). Se la tabella
// cms_audit_log non esiste ancora (migration non applicata), risponde con
// `disponibile: false` invece di un errore — la dashboard mostra un
// messaggio esplicito, mai una lista vuota ambigua.
export const prerender = false;

import type { APIContext } from 'astro';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { hasPermission } from '../../../../lib/admin/roles';
import { getRecentAuditEvents } from '../../../../lib/admin/audit';

export async function GET({ request }: APIContext): Promise<Response> {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }
  if (!hasPermission(auth.user.role, 'audit.view')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const result = await getRecentAuditEvents(10);
  return Response.json(result);
}
