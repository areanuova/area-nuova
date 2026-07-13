// SOLO lato browser. Importa esclusivamente il client Supabase anon
// (src/lib/supabase.ts) — MAI src/lib/aris/supabase-admin.ts (service
// role). Questo file è separato da auth-server.ts apposta: non basta
// "non chiamare" la funzione server-side dal client, il modulo che la
// contiene non deve nemmeno finire nel bundle del browser. Tenerle in
// file distinti rende la separazione strutturale, non affidata al solo
// tree-shaking del bundler.
import { supabase } from '../supabase';
import { COMPATIBILITY_ROLE, type AdminUser, type CmsRole } from './roles';

/**
 * Da usare nelle pagine Astro /admin/* per il rendering iniziale
 * (mostrare/nascondere voci di menu, badge del ruolo). Usa il client anon —
 * la lettura di admin_users è filtrata da RLS (policy "Admin: SELECT
 * proprio record": un utente vede solo la propria riga). Questo NON è il
 * controllo di sicurezza reale per le operazioni che scrivono dati: quelle
 * passano sempre da requireAdminUser (auth-server.ts) lato server.
 *
 * Esito distinto per stato: 'ok' (riga trovata), 'not_admin' (nessuna
 * sessione, o sessione ma nessuna riga in admin_users — nessun errore),
 * 'db_error' (la query è fallita per un motivo diverso da "colonna assente",
 * es. errore RLS — non va mai interpretato come "non admin", altrimenti un
 * guasto database si traveste da "Accesso non consentito").
 */
export type AdminUserResult =
  | { status: 'not_admin' }
  | { status: 'db_error'; message: string; code?: string }
  | { status: 'ok'; user: AdminUser };

export async function getAdminUserClient(): Promise<AdminUserResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user?.email;

  if (!email) return { status: 'not_admin' };

  const esteso = await supabase.from('admin_users').select('id, email, role, attivo').eq('email', email).maybeSingle();

  let row: { id: string; email: string; role?: string; attivo?: boolean } | null;

  if (!esteso.error) {
    row = esteso.data;
  } else if (esteso.error.code === '42703') {
    // undefined_column: schema pre-migration (colonne role/attivo non ancora
    // presenti) — unico caso in cui un errore sulla query "estesa" è atteso,
    // si ripiega sullo schema minimo storico.
    const fallback = await supabase.from('admin_users').select('id, email').eq('email', email).maybeSingle();

    if (fallback.error) {
      return { status: 'db_error', message: fallback.error.message, code: fallback.error.code };
    }
    row = fallback.data;
  } else {
    // Qualunque altro codice (es. 42P17 ricorsione RLS, timeout, permessi):
    // errore reale, non un segnale di "utente non admin" — non va mai
    // silenziato dietro "Accesso non consentito".
    return { status: 'db_error', message: esteso.error.message, code: esteso.error.code };
  }

  if (!row) return { status: 'not_admin' };

  const compatibilityMode = row.role === undefined;

  return {
    status: 'ok',
    user: {
      id: row.id,
      email: row.email,
      role: compatibilityMode ? COMPATIBILITY_ROLE : (row.role as CmsRole),
      attivo: row.attivo ?? true,
      compatibilityMode,
    },
  };
}
