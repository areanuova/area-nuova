// GET /api/admin/media/list — elenco filtrabile della media library
// (Sprint 5.0B, Fase 2). Filtri: q (nome file), tipo (image|pdf|doc),
// pagina. Calcola anche se ogni file risulta "in uso" in almeno un
// contenuto (scansione best-effort di tutte le collection git-backed),
// per abilitare/disabilitare l'eliminazione lato UI in modo informato.
export const prerender = false;

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { hasPermission } from '../../../../lib/admin/roles';
import { getAdminSupabase } from '../../../../lib/aris/supabase-admin';
import { withErrorHandling } from '../../../../lib/admin/api-handler';
import { isPostgrestTabellaAssente } from '../../../../lib/admin/media';

const COLLEZIONI_DA_SCANSIONARE = [
  'news', 'guide', 'documenti', 'progetti', 'video', 'gruppi-whatsapp',
  'partnership', 'convenzioni', 'rappresentanti', 'eventi',
] as const;

async function pathInUso(path: string): Promise<boolean> {
  for (const collezione of COLLEZIONI_DA_SCANSIONARE) {
    try {
      const entries = await getCollection(collezione as any);
      for (const e of entries as any[]) {
        if (JSON.stringify(e.data).includes(path)) return true;
      }
    } catch {
      // collection potenzialmente assente in un ambiente parziale: non bloccante.
    }
  }
  return false;
}

export const GET = withErrorHandling(async ({ request, url }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
  if (!hasPermission(auth.user.role, 'media.manage', auth.user.permessiExtra)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const q = url.searchParams.get('q')?.trim() ?? '';
  const tipo = url.searchParams.get('tipo') ?? ''; // image | pdf | doc
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const perPage = 40;

  const sb = getAdminSupabase();
  let query = sb.from('cms_media').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (q) query = query.ilike('filename', `%${q}%`);
  if (tipo === 'image') query = query.like('mime_type', 'image/%');
  else if (tipo === 'pdf') query = query.eq('mime_type', 'application/pdf');
  else if (tipo === 'doc') query = query.in('mime_type', ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

  const from = (page - 1) * perPage;
  const { data, error, count } = await query.range(from, from + perPage - 1);

  if (error) {
    if (isPostgrestTabellaAssente(error)) {
      return Response.json({ disponibile: false, file: [], totale: 0 });
    }
    return Response.json({ error: 'db_read_failed', message: error.message }, { status: 502 });
  }

  const conUso = await Promise.all(
    (data ?? []).map(async (m) => ({ ...m, inUso: await pathInUso(m.path) })),
  );

  return Response.json({ disponibile: true, file: conUso, totale: count ?? 0, pagina: page, perPage });
});
