// POST /api/admin/users/create — aggiunge un nuovo amministratore
// all'allow-list `admin_users`. Solo super_admin. Non crea un account
// Supabase Auth: la persona potrà accedere con il primo magic link
// richiesto sulla propria email (comportamento già previsto dal progetto,
// vedi supabase/_bootstrap/bootstrap_super_admin.sql), coerente con
// `signInWithOtp` che crea l'utente Auth al primo accesso se assente.
export const prerender = false;

import type { APIContext } from 'astro';
import { z } from 'astro:content';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { hasPermission, CMS_ROLES, type CmsRole } from '../../../../lib/admin/roles';
import { getAdminSupabase } from '../../../../lib/aris/supabase-admin';
import { logAuditEvent } from '../../../../lib/admin/audit';
import { withErrorHandling } from '../../../../lib/admin/api-handler';

const bodySchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(CMS_ROLES as [CmsRole, ...CmsRole[]]).default('editor'),
  nome: z.string().max(120).optional().or(z.literal('')),
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
  const email = parsed.data.email.trim().toLowerCase();
  const { role, nome } = parsed.data;

  const sb = getAdminSupabase();

  const existing = await sb.from('admin_users').select('id').eq('email', email).maybeSingle();
  if (existing.data) {
    return Response.json({ error: 'already_exists', message: 'Esiste già un amministratore con questa email.' }, { status: 409 });
  }

  const { data, error } = await sb
    .from('admin_users')
    .insert({ email, role, attivo: true, nome: nome || null, creato_da: auth.user.id })
    .select('id, email, role, attivo')
    .single();

  if (error) {
    return Response.json({ error: 'create_failed', message: error.message }, { status: 502 });
  }

  await logAuditEvent({
    utente: auth.user,
    azione: 'create',
    collezione: 'admin_users',
    entryId: email,
    dettagli: { role },
  });

  return Response.json({ ok: true, utente: data });
});
