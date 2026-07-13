// GET /api/admin/search?q=... — ricerca globale (Sprint 5.0) su tutte le
// collection CMS-gestite, Partnership, Utenti e Audit. Ricerca semplice per
// sottostringa (case-insensitive) su titolo/slug/categoria/stato/email —
// nessun indice esterno, coerente con il volume di contenuti del sito
// (poche decine di voci per collection, non serve altro).
export const prerender = false;

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { requireAdminUser } from '../../../lib/admin/auth-server';
import { hasPermission } from '../../../lib/admin/roles';
import { getAdminSupabase } from '../../../lib/aris/supabase-admin';
import { CONTENT_TYPES } from '../../../lib/admin/content-types';
import { withErrorHandling } from '../../../lib/admin/api-handler';

export interface SearchResult {
  tipo: string;
  label: string;
  titolo: string;
  sottotitolo?: string;
  url: string;
}

const RICERCABILI = ['news', 'guide', 'documenti', 'progetti', 'video', 'gruppi-whatsapp'] as const;

export const GET = withErrorHandling(async ({ request, url }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }

  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  if (q.length < 2) {
    return Response.json({ risultati: [] });
  }

  const risultati: SearchResult[] = [];

  for (const tipo of RICERCABILI) {
    const typeDef = CONTENT_TYPES[tipo];
    const entries = await getCollection(tipo as any);
    for (const e of entries as any[]) {
      const titolo = e.data[typeDef.titleField] ?? e.slug;
      const stato = e.data[typeDef.statoField] ?? 'published';
      const haystack = [titolo, e.slug, e.data.categoria, stato, e.data.referente].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(q)) {
        risultati.push({
          tipo, label: typeDef.label, titolo,
          sottotitolo: `${stato} · ${e.slug}`,
          url: `/admin/contenuti/${tipo}/${e.slug}`,
        });
      }
    }
  }

  // Partnership resta sul modulo dedicato (Sprint 3), non sul registro generico.
  const partnership = await getCollection('partnership');
  for (const e of partnership) {
    const haystack = [e.data.nome, e.slug, e.data.categoria, e.data.stato].filter(Boolean).join(' ').toLowerCase();
    if (haystack.includes(q)) {
      risultati.push({ tipo: 'partnership', label: 'Partnership', titolo: e.data.nome, sottotitolo: `${e.data.stato} · ${e.slug}`, url: `/admin/partnership/${e.slug}` });
    }
  }

  if (hasPermission(auth.user.role, 'users.manage')) {
    const sb = getAdminSupabase();
    const { data } = await sb.from('admin_users').select('id, email, role').ilike('email', `%${q}%`).limit(10);
    for (const u of data ?? []) {
      risultati.push({ tipo: 'utente', label: 'Utente', titolo: u.email, sottotitolo: u.role, url: '/admin/utenti' });
    }
  }

  return Response.json({ risultati: risultati.slice(0, 40) });
});
