// POST /api/admin/users/touch — registra "ultima attività" per l'account
// autenticato (Sprint 5.0B, Fase 10). Chiamato al massimo una volta per
// sessione browser da AdminLayout.astro, non a ogni richiesta: scrivere ad
// ogni fetch aggiungerebbe latenza e volume di scrittura senza un beneficio
// reale (la granularità "una volta per sessione" è più che sufficiente per
// capire chi è attivo). Tollerante all'assenza della colonna (migration
// Sprint 5.0B non ancora applicata): fallisce in silenzio, mai un errore
// visibile per una funzionalità accessoria.
export const prerender = false;

import type { APIContext } from 'astro';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { getAdminSupabase } from '../../../../lib/aris/supabase-admin';
import { withErrorHandling } from '../../../../lib/admin/api-handler';

export const POST = withErrorHandling(async ({ request }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });

  const sb = getAdminSupabase();
  const { error } = await sb.from('admin_users').update({ ultima_attivita: new Date().toISOString() }).eq('id', auth.user.id);

  return Response.json({ ok: !error });
});
