// GET /api/admin/contenuti/{tipo}/list — elenco completo (inclusi
// draft/review/archived) per il pannello admin, generico per tutte le
// collection registrate in content-types.ts. Stesso principio di sicurezza
// di partnership/list.ts: mai esposto via SSR di pagina, richiede sempre un
// bearer token verificato server-side.
export const prerender = false;

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { requireAdminUser } from '../../../../../lib/admin/auth-server';
import { withErrorHandling } from '../../../../../lib/admin/api-handler';
import { getContentType } from '../../../../../lib/admin/content-types';

export const GET = withErrorHandling(async ({ request, params }: APIContext): Promise<Response> => {
  const typeDef = getContentType(params.tipo ?? '');
  if (!typeDef) {
    return Response.json({ error: 'unknown_content_type' }, { status: 404 });
  }

  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }

  const entries = await getCollection(typeDef.collection as any);
  // `body` (markdown grezzo) sempre incluso: il form di modifica lo usa per
  // precompilare "Contenuto pagina" senza cancellarlo a ogni salvataggio.
  const righe = entries.map((e: any) => ({ slug: e.slug, ...e.data, corpo: e.body }));

  return Response.json({
    righe,
    nota: 'Elenco letto dallo snapshot dell\'ultimo deploy (Content Collections). In sviluppo locale è sempre aggiornato in tempo reale; in produzione riflette le modifiche solo dopo il prossimo deploy innescato dal commit su GitHub.',
  });
});
