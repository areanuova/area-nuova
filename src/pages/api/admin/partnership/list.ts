// GET /api/admin/partnership/list — elenco completo (inclusi draft/review/
// archived) per il pannello admin. Mai esposto via SSR/frontmatter di
// pagina (vedi nota in docs/CMS_SPRINT_3.md sul perché): l'intero pannello
// AdminLayout è gated solo lato client, quindi qualunque dato incluso nella
// risposta HTML iniziale sarebbe visibile nel sorgente pagina anche a un
// visitatore non autenticato. Questo endpoint richiede invece un bearer
// token verificato server-side prima di restituire qualunque riga.
export const prerender = false;

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { requireAdminUser } from '../../../../lib/admin/auth-server';

export async function GET({ request }: APIContext): Promise<Response> {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }

  const entries = await getCollection('partnership');
  const righe = entries
    .map((e) => ({ slug: e.slug, ...e.data }))
    .sort((a, b) => a.ordine - b.ordine);

  return Response.json({
    righe,
    // Promemoria esplicito in risposta (non solo nei log): il pannello lo
    // mostra in UI così l'operatore capisce perché una modifica appena
    // salvata potrebbe non comparire subito qui.
    nota: 'Elenco letto dallo snapshot dell\'ultimo deploy (Content Collections). In sviluppo locale è sempre aggiornato in tempo reale; in produzione riflette le modifiche solo dopo il prossimo deploy innescato dal commit su GitHub.',
  });
}
