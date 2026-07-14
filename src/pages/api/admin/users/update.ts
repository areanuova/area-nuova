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
  // Sprint 5.0B (Fase 10) — richiedono la migration 20260714000000 sulle
  // colonne admin_users; se le colonne non esistono ancora, l'update
  // ripiega automaticamente su un tentativo senza questi campi (vedi sotto).
  sospeso: z.boolean().optional(),
  sospesoMotivo: z.string().max(500).optional(),
  noteInterne: z.string().max(1000).optional(),
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
  const { id, role, attivo, sospeso, sospesoMotivo, noteInterne } = parsed.data;
  if ([role, attivo, sospeso, sospesoMotivo, noteInterne].every((v) => v === undefined)) {
    return Response.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  if (id === auth.user.id) {
    return Response.json(
      { error: 'self_modification_forbidden', message: 'Non puoi modificare ruolo o stato del tuo stesso account. Chiedi a un altro Super Admin.' },
      { status: 403 },
    );
  }

  const sb = getAdminSupabase();

  // Protezione "ultimo Super Admin": se il target è oggi super_admin attivo
  // e la modifica lo declasserebbe/disattiverebbe/sospenderebbe, verifica
  // che esista almeno un altro super_admin attivo prima di procedere.
  const declassamento = (role !== undefined && role !== 'super_admin') || attivo === false || sospeso === true;
  if (declassamento) {
    const { data: target } = await sb.from('admin_users').select('role, attivo').eq('id', id).maybeSingle();
    if (target?.role === 'super_admin' && target.attivo) {
      const { count } = await sb
        .from('admin_users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'super_admin')
        .eq('attivo', true)
        .neq('id', id);
      if (!count || count < 1) {
        return Response.json(
          { error: 'ultimo_super_admin', message: 'Questo è l\'unico Super Admin attivo: non può essere declassato, disattivato o sospeso. Promuovi prima un altro account.' },
          { status: 403 },
        );
      }
    }
  }

  const updatesCompleti: Record<string, unknown> = {};
  if (role !== undefined) updatesCompleti.role = role;
  if (attivo !== undefined) updatesCompleti.attivo = attivo;
  if (sospeso !== undefined) {
    updatesCompleti.sospeso = sospeso;
    updatesCompleti.sospeso_motivo = sospeso ? (sospesoMotivo ?? null) : null;
    updatesCompleti.sospeso_il = sospeso ? new Date().toISOString() : null;
  }
  if (noteInterne !== undefined) updatesCompleti.note_interne = noteInterne;

  let { data, error } = await sb.from('admin_users').update(updatesCompleti).eq('id', id).select('id, email, role, attivo').maybeSingle();

  let colonneNonDisponibili = false;
  if (error && (sospeso !== undefined || noteInterne !== undefined)) {
    // Migration 20260714000000 non ancora applicata: ripiega su solo role/attivo,
    // che esistono da sempre — mai far fallire l'intera richiesta per un
    // campo opzionale non ancora supportato dallo schema remoto.
    colonneNonDisponibili = true;
    const updatesBase: Record<string, unknown> = {};
    if (role !== undefined) updatesBase.role = role;
    if (attivo !== undefined) updatesBase.attivo = attivo;
    if (Object.keys(updatesBase).length > 0) {
      ({ data, error } = await sb.from('admin_users').update(updatesBase).eq('id', id).select('id, email, role, attivo').maybeSingle());
    } else {
      return Response.json(
        { error: 'colonne_non_disponibili', message: 'Sospensione/note richiedono la migration Sprint 5.0B, non ancora applicata su questo ambiente.' },
        { status: 409 },
      );
    }
  }

  if (error) {
    return Response.json({ error: 'update_failed', message: error.message }, { status: 502 });
  }
  if (!data) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  await logAuditEvent({
    utente: auth.user,
    azione: sospeso === true ? 'suspend' : sospeso === false ? 'reactivate' : role !== undefined ? 'role_change' : 'update',
    collezione: 'admin_users',
    entryId: data.email,
    dettagli: { targetId: id, role, attivo, sospeso, colonneNonDisponibili },
  });

  return Response.json({ ok: true, utente: data, colonneNonDisponibili });
});
