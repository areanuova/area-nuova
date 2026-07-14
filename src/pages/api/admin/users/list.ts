// GET /api/admin/users/list — elenco admin_users, solo per chi ha il
// permesso 'users.manage' (super_admin). Se un ambiente dovesse trovarsi
// ancora in modalità compatibilità (colonna `role` assente, vedi
// src/lib/admin/roles.ts, COMPATIBILITY_ROLE = 'admin'), l'endpoint
// risponde comunque sempre 403: non possiamo concedere gestione utenti
// senza poter distinguere davvero chi è super_admin.
export const prerender = false;

import type { APIContext } from 'astro';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { hasPermission } from '../../../../lib/admin/roles';
import { getAdminSupabase } from '../../../../lib/aris/supabase-admin';
import { withErrorHandling } from '../../../../lib/admin/api-handler';

export const GET = withErrorHandling(async ({ request }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }
  if (!hasPermission(auth.user.role, 'users.manage')) {
    return Response.json({ error: 'forbidden', compatibilityMode: auth.user.compatibilityMode }, { status: 403 });
  }

  const sb = getAdminSupabase();

  // Sprint 5.0B: tenta lo schema più esteso (sospeso, note, ultima attività),
  // ripiegando via via su schemi più minimi se le colonne non esistono
  // ancora — stesso pattern tollerante di auth-server.ts.
  const completo = await sb
    .from('admin_users')
    .select('id, email, role, attivo, created_at, sospeso, sospeso_motivo, sospeso_il, ultima_attivita, note_interne')
    .order('created_at', { ascending: true });
  if (!completo.error) {
    return Response.json({ righe: completo.data ?? [], schemaEsteso: true, sospensioneDisponibile: true });
  }

  const esteso = await sb.from('admin_users').select('id, email, role, attivo, created_at').order('created_at', { ascending: true });
  const righe = !esteso.error
    ? esteso.data
    : (await sb.from('admin_users').select('id, email, created_at').order('created_at', { ascending: true })).data;

  return Response.json({ righe: righe ?? [], schemaEsteso: !esteso.error, sospensioneDisponibile: false });
});
