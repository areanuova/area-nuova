export const prerender = false;

import type { APIContext } from 'astro';
import { getAdminSupabase } from '../../../lib/aris/supabase-admin';
import { rateLimit, getClientIp } from '../../../lib/aris/security';

export async function POST({ request }: APIContext): Promise<Response> {
  const ip = getClientIp(request);
  const rl = rateLimit(`feedback:${ip}`, 20, 5 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json({ error: 'Troppe richieste.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON non valido.' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const { response_id, question, answer, rating, sources, page_url } = b;

  if (typeof rating !== 'number' || ![1, -1].includes(rating)) {
    return Response.json({ error: 'Il campo "rating" deve essere 1 o -1.' }, { status: 400 });
  }
  if (typeof question !== 'string' || !question.trim()) {
    return Response.json({ error: 'Il campo "question" è obbligatorio.' }, { status: 400 });
  }
  if (typeof answer !== 'string' || !answer.trim()) {
    return Response.json({ error: 'Il campo "answer" è obbligatorio.' }, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent') ?? null;

  try {
    const sb = getAdminSupabase();
    const { error } = await sb.from('aris_feedback').insert({
      response_id:  typeof response_id === 'string' ? response_id.slice(0, 64)  : null,
      question:     question.slice(0, 1_000),
      answer:       answer.slice(0, 5_000),
      rating,
      sources:      Array.isArray(sources) ? sources : [],
      page_url:     typeof page_url === 'string' ? page_url.slice(0, 500) : null,
      user_agent:   userAgent?.slice(0, 500) ?? null,
    });

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[/api/aris/feedback]', err);
    return Response.json({ error: 'Errore salvataggio feedback.' }, { status: 500 });
  }
}
