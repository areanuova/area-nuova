// Audit log best-effort (Sprint 3). La tabella cms_audit_log è definita in
// supabase/migrations/20260712000000_cms_roles.sql (applicata dallo Sprint
// 3.1). Questo helper tenta comunque di scrivere l'evento e, se la tabella
// non esistesse in un ambiente non ancora migrato, intercetta l'errore
// esplicitamente e prosegue senza interrompere l'operazione principale
// (creare/pubblicare una Partnership non deve mai fallire per colpa
// dell'audit log). Ogni chiamata fallita viene loggata in console con un
// prefisso riconoscibile, mai silenziata del tutto.

import { getAdminSupabase } from '../aris/supabase-admin';
import type { AdminUser } from './roles';

// Sprint 5.0B (Fase 11): elenco esteso di azioni tracciabili. `azione` resta
// una colonna text libera (nessuna migration di schema necessaria per
// aggiungere valori) — questo union type è solo un contratto lato codice,
// per evitare refusi tra i chiamanti.
export type AuditAzione =
  | 'create' | 'update' | 'publish' | 'archive' | 'error'
  | 'duplicate' | 'bulk_update' | 'assign' | 'review_request' | 'approve' | 'reject'
  | 'import' | 'export' | 'media_upload' | 'media_replace' | 'media_delete'
  | 'restore_version' | 'settings_update'
  | 'invite' | 'reinvite' | 'role_change' | 'suspend' | 'reactivate'
  | 'schedule' | 'schedule_run';

export interface AuditEvent {
  utente: AdminUser;
  azione: AuditAzione;
  collezione: string;
  entryId: string;
  dettagli?: Record<string, unknown>;
}

export interface AuditLogResult {
  scritto: boolean;
  motivo?: 'tabella_assente' | 'errore_scrittura';
}

/**
 * Non lancia mai eccezioni. Il chiamante può ignorare il risultato o
 * mostrarlo in UI (es. "operazione salvata, audit non disponibile").
 * Non registra mai token, password, secret o contenuti personali non
 * necessari — `dettagli` deve contenere solo metadati minimi (es. stato
 * precedente/nuovo, titolo), mai payload completi con dati di contatto.
 */
export async function logAuditEvent(event: AuditEvent): Promise<AuditLogResult> {
  try {
    const sb = getAdminSupabase();
    const { error } = await sb.from('cms_audit_log').insert({
      admin_id: event.utente.id,
      azione: event.azione,
      collezione: event.collezione,
      entry_id: event.entryId,
      dettagli: {
        ruolo: event.utente.role,
        compatibility_mode: event.utente.compatibilityMode,
        ...event.dettagli,
      },
    });

    if (error) {
      // 42P01 = "relation does not exist" — la tabella non esiste ancora.
      if (error.code === '42P01' || /relation .* does not exist/i.test(error.message)) {
        console.warn('[audit] cms_audit_log non esiste ancora (migration non applicata) — evento non registrato:', event.azione, event.collezione, event.entryId);
        return { scritto: false, motivo: 'tabella_assente' };
      }
      console.error('[audit] scrittura fallita:', error.message);
      return { scritto: false, motivo: 'errore_scrittura' };
    }

    return { scritto: true };
  } catch (err) {
    console.error('[audit] eccezione imprevista:', err);
    return { scritto: false, motivo: 'errore_scrittura' };
  }
}

/** Legge gli eventi più recenti, solo se la tabella esiste. Usato dalla dashboard. */
export async function getRecentAuditEvents(limit = 10): Promise<
  { righe: Array<{ azione: string; collezione: string; entry_id: string; created_at: string }>; disponibile: boolean }
> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from('cms_audit_log')
      .select('azione, collezione, entry_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { righe: [], disponibile: false };
    }
    return { righe: data ?? [], disponibile: true };
  } catch {
    return { righe: [], disponibile: false };
  }
}

export interface AuditQueryFiltri {
  azione?: string;
  collezione?: string;
  page?: number;
  perPage?: number;
}

export interface AuditQueryResult {
  righe: Array<{ id: string; azione: string; collezione: string; entry_id: string; dettagli: unknown; created_at: string; admin_id: string | null }>;
  totale: number;
  disponibile: boolean;
}

/** Elenco filtrato e paginato, usato dalla pagina /admin/audit (Fase 11). */
export async function queryAuditEvents(filtri: AuditQueryFiltri): Promise<AuditQueryResult> {
  const page = Math.max(1, filtri.page ?? 1);
  const perPage = Math.min(100, Math.max(1, filtri.perPage ?? 25));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  try {
    const sb = getAdminSupabase();
    let query = sb
      .from('cms_audit_log')
      .select('id, azione, collezione, entry_id, dettagli, created_at, admin_id', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filtri.azione) query = query.eq('azione', filtri.azione);
    if (filtri.collezione) query = query.eq('collezione', filtri.collezione);

    const { data, error, count } = await query.range(from, to);
    if (error) return { righe: [], totale: 0, disponibile: false };
    return { righe: data ?? [], totale: count ?? 0, disponibile: true };
  } catch {
    return { righe: [], totale: 0, disponibile: false };
  }
}
