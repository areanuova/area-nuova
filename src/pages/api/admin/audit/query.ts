// GET /api/admin/audit/query — registro attività filtrato e paginato
// (Sprint 5.0B, Fase 11). Distinto da audit/recent.ts (che resta la vista
// compatta a 10 righe usata dalla dashboard) per non introdurre parametri
// opzionali su una route già in uso e verificata.
export const prerender = false;

import type { APIContext } from 'astro';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { hasPermission } from '../../../../lib/admin/roles';
import { queryAuditEvents } from '../../../../lib/admin/audit';
import { withErrorHandling } from '../../../../lib/admin/api-handler';

export const GET = withErrorHandling(async ({ request, url }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
  if (!hasPermission(auth.user.role, 'audit.view')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const azione = url.searchParams.get('azione') || undefined;
  const collezione = url.searchParams.get('collezione') || undefined;
  const page = Number(url.searchParams.get('page') ?? '1') || 1;

  const result = await queryAuditEvents({ azione, collezione, page, perPage: 25 });
  return Response.json(result);
});
