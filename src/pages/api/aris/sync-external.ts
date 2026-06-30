import type { APIContext } from 'astro';
import { syncAllSources }  from '../../../lib/aris/external/sync';

export const prerender = false;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('Authorization') ?? '';

  // Vercel Cron uses CRON_SECRET
  const cronSecret = import.meta.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  // Manual / GitHub Action uses ARIS_ADMIN_KEY
  const adminKey = import.meta.env.ARIS_ADMIN_KEY;
  if (adminKey && auth === `Bearer ${adminKey}`) return true;

  return false;
}

async function runSync(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sourceIds: string[] | undefined;

  try {
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body.sourceIds && Array.isArray(body.sourceIds)) {
        sourceIds = body.sourceIds as string[];
      }
    }
  } catch { /* ignore parse errors */ }

  try {
    const results = await syncAllSources(sourceIds);
    const summary = {
      ok:      true,
      synced:  results.length,
      updated: results.reduce((a, r) => a + r.pagesUpdated, 0),
      errors:  results.flatMap(r => r.errors),
      results,
    };
    return Response.json(summary, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync-external]', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export function GET(ctx: APIContext): Promise<Response>  { return runSync(ctx.request); }
export function POST(ctx: APIContext): Promise<Response> { return runSync(ctx.request); }
