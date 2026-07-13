// GET /api/admin/contenuti/gruppi-whatsapp/export?format=csv|json
export const prerender = false;

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { requireAdminUser } from '../../../../../lib/admin/auth-server';
import { withErrorHandling } from '../../../../../lib/admin/api-handler';
import { objectsToCsv } from '../../../../../lib/admin/csv';
import { CONTENT_TYPES } from '../../../../../lib/admin/content-types';

const typeDef = CONTENT_TYPES['gruppi-whatsapp'];
const COLUMNS = ['slug', ...typeDef.fields.map((f) => f.key), 'corpo'];

export const GET = withErrorHandling(async ({ request, url }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }

  const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';
  const entries = await getCollection('gruppi-whatsapp');
  const righe = entries.map((e) => ({
    slug: e.slug,
    ...e.data,
    corsi: Array.isArray(e.data.corsi) ? e.data.corsi.join('|') : '',
    corpo: e.body ?? '',
  }));

  if (format === 'json') {
    return new Response(JSON.stringify(entries.map((e) => ({ slug: e.slug, ...e.data, corpo: e.body })), null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="gruppi-whatsapp.json"',
      },
    });
  }

  const csv = objectsToCsv(righe, COLUMNS);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="gruppi-whatsapp.csv"',
    },
  });
});
