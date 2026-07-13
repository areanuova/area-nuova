// GET /api/admin/contenuti/{tipo}/history?slug=... — cronologia dei commit
// Git per un contenuto (Sprint 5.0B, Fase 6). Nessuna tabella di versioni:
// la cronologia reale è quella del repository, già completa e a prova di
// manomissione.
export const prerender = false;

import type { APIContext } from 'astro';
import { requireAdminUser } from '../../../../../lib/admin/auth-server';
import { getContentType } from '../../../../../lib/admin/content-types';
import { contentFilePathGeneric } from '../../../../../lib/admin/content-utils';
import { listFileCommits } from '../../../../../lib/admin/github';
import { withErrorHandling } from '../../../../../lib/admin/api-handler';

export const GET = withErrorHandling(async ({ request, params, url }: APIContext): Promise<Response> => {
  const typeDef = getContentType(params.tipo ?? '');
  if (!typeDef) return Response.json({ error: 'unknown_content_type' }, { status: 404 });

  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });

  const slug = url.searchParams.get('slug') ?? '';
  let path: string;
  try {
    path = contentFilePathGeneric(typeDef.collectionDir, slug);
  } catch (err) {
    return Response.json({ error: 'invalid_slug', message: String((err as Error).message) }, { status: 400 });
  }

  try {
    const commits = await listFileCommits(path);
    return Response.json({ commits, path });
  } catch (err) {
    return Response.json({ error: 'github_read_failed', message: String((err as Error).message) }, { status: 502 });
  }
});
