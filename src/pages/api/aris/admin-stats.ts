export const prerender = false;

import type { APIContext } from 'astro';
import { getAdminSupabase } from '../../../lib/aris/supabase-admin';

export async function GET({ request }: APIContext): Promise<Response> {
  const adminSecret = import.meta.env.ARIS_ADMIN_SECRET;
  if (!adminSecret) {
    return Response.json({ error: 'Dashboard non configurata.' }, { status: 401 });
  }
  const auth = request.headers.get('x-admin-secret');
  if (!auth || auth !== adminSecret) {
    return Response.json({ error: 'Non autorizzato.' }, { status: 401 });
  }

  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from('aris_feedback')
    .select('id, created_at, question, answer, rating, sources, page_url')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return Response.json({ error: 'Errore database.' }, { status: 500 });
  }

  return Response.json({ rows: data ?? [] });
}
