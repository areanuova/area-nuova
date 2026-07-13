// SOLO lato server (route API /api/admin/*, mai importato da uno <script>
// di pagina). Usa sia il client anon (per verificare il token) sia il
// client service-role (per leggere admin_users bypassando RLS in modo
// affidabile). Separato da auth-client.ts apposta — vedi commento lì.
import { supabase } from '../supabase';
import { getAdminSupabase } from '../aris/supabase-admin';
import { COMPATIBILITY_ROLE, type AdminUser, type CmsRole } from './roles';

/**
 * Legge la riga admin_users per l'email indicata, tentando prima lo schema
 * esteso (role, attivo — introdotto da 20260712000000_cms_roles.sql, non
 * ancora applicato sul remoto) e ripiegando sullo schema minimo reale
 * (id, email) se le colonne non esistono. Nessuna riscrittura necessaria
 * quando la migration verrà applicata in futuro.
 */
async function fetchAdminRow(
  email: string,
): Promise<{ id: string; email: string; role?: string; attivo?: boolean } | null> {
  const sb = getAdminSupabase();

  const esteso = await sb
    .from('admin_users')
    .select('id, email, role, attivo')
    .eq('email', email)
    .maybeSingle();

  if (!esteso.error) {
    return esteso.data;
  }

  const minimo = await sb.from('admin_users').select('id, email').eq('email', email).maybeSingle();
  if (minimo.error) {
    throw new Error(`Verifica admin fallita: ${minimo.error.message}`);
  }
  return minimo.data;
}

function toAdminUser(row: { id: string; email: string; role?: string; attivo?: boolean }): AdminUser {
  const compatibilityMode = row.role === undefined;
  return {
    id: row.id,
    email: row.email,
    role: compatibilityMode ? COMPATIBILITY_ROLE : (row.role as CmsRole),
    attivo: row.attivo ?? true,
    compatibilityMode,
  };
}

/**
 * Da usare in ogni route /api/admin/*. Il client invia il proprio access
 * token Supabase (ottenuto da supabase.auth.getSession() nel browser) come
 * header `Authorization: Bearer <token>`; questa funzione lo verifica
 * chiamando supabase.auth.getUser(token), che convalida il JWT contro il
 * server Auth di Supabase — non è possibile falsificarlo lato client.
 *
 * Non lancia mai eccezioni per "non autorizzato": restituisce sempre un
 * risultato tipizzato, così il chiamante decide la risposta HTTP corretta
 * (401 vs 403) senza try/catch sparsi.
 */
export async function requireAdminUser(
  request: Request,
): Promise<
  | { ok: true; user: AdminUser }
  | { ok: false; status: 401; reason: 'missing_token' | 'invalid_token' }
  | { ok: false; status: 403; reason: 'not_admin' | 'inactive' }
> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return { ok: false, status: 401, reason: 'missing_token' };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user?.email) {
    return { ok: false, status: 401, reason: 'invalid_token' };
  }

  const row = await fetchAdminRow(userData.user.email);

  if (!row) {
    return { ok: false, status: 403, reason: 'not_admin' };
  }

  const adminUser = toAdminUser(row);
  if (!adminUser.attivo) {
    return { ok: false, status: 403, reason: 'inactive' };
  }

  return { ok: true, user: adminUser };
}
