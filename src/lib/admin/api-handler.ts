// Wrapper comune per le route /api/admin/*: qualunque eccezione non gestita
// (es. una dipendenza server-side non inizializzabile) va sempre restituita
// come JSON con status 500, mai come risposta vuota — un client che fa
// `await res.json()` su un corpo vuoto ottiene un errore criptico
// ("Unexpected end of JSON input") che nasconde la causa reale. Il dettaglio
// dell'errore va solo nel log server (mai al client: potrebbe contenere
// percorsi interni o nomi di variabili d'ambiente).
import type { APIContext } from 'astro';

type Handler = (ctx: APIContext) => Promise<Response>;

export function withErrorHandling(handler: Handler): Handler {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      console.error('[admin-api] errore non gestito su', ctx.request.method, ctx.url.pathname, '—', (err as Error)?.message ?? err);
      return Response.json(
        { error: 'internal_error', message: 'Errore interno del server. Riprova più tardi.' },
        { status: 500 },
      );
    }
  };
}
