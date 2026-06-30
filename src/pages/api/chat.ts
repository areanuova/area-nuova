export const prerender = false;

import type { APIContext } from 'astro';
import { streamArisResponse } from '../../lib/aris/chat';
import {
  rateLimit,
  getClientIp,
  validateChatBody,
} from '../../lib/aris/security';
import { ARIS_CONFIG } from '../../lib/aris/config';

export async function POST({ request }: APIContext): Promise<Response> {
  // Rate limiting
  const ip = getClientIp(request);
  const rl = rateLimit(
    `chat:${ip}`,
    ARIS_CONFIG.rateLimit.chat.requests,
    ARIS_CONFIG.rateLimit.chat.windowMs,
  );
  if (!rl.allowed) {
    return Response.json(
      { error: 'Troppe richieste. Riprova tra qualche minuto.' },
      { status: 429 },
    );
  }

  // Parse & validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON non valido.' }, { status: 400 });
  }

  const validation = validateChatBody(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const { message, history, context } = validation;

  // Streaming SSE response
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamArisResponse({ message, history, context }, controller)
        .catch((err) => {
          console.error('[/api/chat stream]', err);
          const enc = new TextEncoder();
          controller.enqueue(
            enc.encode(
              'data: {"type":"error","message":"Errore interno del server."}\n\n',
            ),
          );
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        })
        .finally(() => {
          try { controller.close(); } catch { /* already closed */ }
        });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
