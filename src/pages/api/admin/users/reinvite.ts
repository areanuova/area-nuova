// POST /api/admin/users/reinvite — invia (o reinvia) un link di accesso
// all'email di un amministratore già presente in admin_users (Sprint 5.0B,
// Fase 10). Non esiste un record di "invito" separato in questa
// architettura: l'accesso è sempre un magic link OTP (stesso meccanismo del
// form di login in AdminLayout.astro). Questo endpoint replica lato server
// esattamente supabase.auth.signInWithOtp(), così un Super Admin può far
// ripartire l'invito per conto di qualcun altro senza che quella persona
// debba conoscere l'URL del pannello in anticipo.
//
// Invia una email reale: solo super_admin, e solo verso un'email già
// nell'allow-list admin_users (mai verso un indirizzo arbitrario passato
// nel body — evita che l'endpoint diventi un mailer generico).
export const prerender = false;

import type { APIContext } from 'astro';
import { z } from 'astro:content';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { hasPermission } from '../../../../lib/admin/roles';
import { getAdminSupabase } from '../../../../lib/aris/supabase-admin';
import { logAuditEvent } from '../../../../lib/admin/audit';
import { withErrorHandling } from '../../../../lib/admin/api-handler';

const bodySchema = z.object({ id: z.string().uuid() });

export const POST = withErrorHandling(async ({ request }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
  if (!hasPermission(auth.user.role, 'users.manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid_request' }, { status: 400 });

  const sb = getAdminSupabase();
  const { data: target, error: readError } = await sb.from('admin_users').select('id, email, attivo').eq('id', parsed.data.id).maybeSingle();
  if (readError || !target) return Response.json({ error: 'not_found' }, { status: 404 });
  if (!target.attivo) {
    return Response.json({ error: 'utente_disattivato', message: 'Riattiva l\'account prima di reinviare un link di accesso.' }, { status: 409 });
  }

  const { error: otpError } = await sb.auth.signInWithOtp({ email: target.email });
  if (otpError) {
    return Response.json({ error: 'invio_fallito', message: otpError.message }, { status: 502 });
  }

  await logAuditEvent({
    utente: auth.user, azione: 'reinvite', collezione: 'admin_users', entryId: target.email,
    dettagli: { targetId: target.id },
  });

  return Response.json({ ok: true, message: `Link di accesso inviato a ${target.email}.` });
});
