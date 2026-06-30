export const prerender = false;

import type { APIContext } from 'astro';
import { retrieveRelevantChunks } from '../../lib/aris/retrieval';
import {
  rateLimit,
  getClientIp,
  sanitize,
  hasInjection,
} from '../../lib/aris/security';
import { ARIS_CONFIG } from '../../lib/aris/config';

export async function POST({ request }: APIContext): Promise<Response> {
  const ip = getClientIp(request);
  const rl = rateLimit(
    `search:${ip}`,
    ARIS_CONFIG.rateLimit.search.requests,
    ARIS_CONFIG.rateLimit.search.windowMs,
  );
  if (!rl.allowed) {
    return Response.json(
      { error: 'Troppe richieste. Riprova tra qualche minuto.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON non valido.' }, { status: 400 });
  }

  const { query, limit } = body as Record<string, unknown>;
  if (typeof query !== 'string' || !query.trim()) {
    return Response.json(
      { error: 'Il campo "query" è obbligatorio.' },
      { status: 400 },
    );
  }

  const clean = sanitize(query);
  if (hasInjection(clean)) {
    return Response.json({ error: 'Query non consentita.' }, { status: 400 });
  }

  const maxResults =
    typeof limit === 'number' && limit > 0 && limit <= 20 ? limit : 6;

  try {
    const results = await retrieveRelevantChunks(clean, maxResults);
    return Response.json({ results });
  } catch (err) {
    console.error('[/api/search]', err);
    return Response.json(
      { error: 'Errore durante la ricerca.' },
      { status: 500 },
    );
  }
}
