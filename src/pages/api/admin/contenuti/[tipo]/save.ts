// POST /api/admin/contenuti/{tipo}/save — crea o aggiorna un contenuto,
// generico per tutte le collection registrate in content-types.ts. Stesso
// principio di partnership/save.ts: un solo endpoint per creazione e
// aggiornamento, validazione Zod dinamica, verifica ruolo/transizione di
// stato, generazione frontmatter deterministica, commit GitHub server-side.
export const prerender = false;

import type { APIContext } from 'astro';
import { requireAdminUser } from '../../../../../lib/admin/auth-server';
import { canTransition, canEditContent, type ContentStato } from '../../../../../lib/admin/roles';
import { logAuditEvent } from '../../../../../lib/admin/audit';
import { contentFilePathGeneric, generateFrontmatterGeneric } from '../../../../../lib/admin/content-utils';
import { buildContentSchema } from '../../../../../lib/admin/validation-generic';
import { getContentType } from '../../../../../lib/admin/content-types';
import { commitContentFile, isGithubConfigured, GithubNonConfiguratoError } from '../../../../../lib/admin/github';
import { withErrorHandling } from '../../../../../lib/admin/api-handler';

export const POST = withErrorHandling(async ({ request, params }: APIContext): Promise<Response> => {
  const typeDef = getContentType(params.tipo ?? '');
  if (!typeDef) {
    return Response.json({ error: 'unknown_content_type' }, { status: 404 });
  }

  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }
  const { user } = auth;

  if (!canEditContent(user.role)) {
    return Response.json({ error: 'forbidden', message: 'Il tuo ruolo non consente di modificare contenuti.' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const statoPrecedente = (payload as any)?.statoPrecedente as ContentStato | undefined;
  const isUpdate = typeof statoPrecedente === 'string';

  const schema = buildContentSchema(typeDef);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: 'validation_error', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    );
  }
  const form = parsed.data as Record<string, unknown>;

  const statoRichiesto = form[typeDef.statoField] as ContentStato;
  const da = isUpdate ? statoPrecedente : 'draft';
  if (!canTransition(user.role, da, statoRichiesto)) {
    return Response.json(
      {
        error: 'invalid_transition',
        message: `Il ruolo "${user.role}" non può portare il contenuto da "${da}" a "${statoRichiesto}".`,
      },
      { status: 403 },
    );
  }

  let path: string;
  try {
    path = contentFilePathGeneric(typeDef.collectionDir, form.slug as string);
  } catch (err) {
    return Response.json({ error: 'invalid_slug', message: String((err as Error).message) }, { status: 400 });
  }

  const fieldOrder = typeDef.fields.map((f) => f.key);
  const values: Record<string, any> = {};
  for (const key of fieldOrder) values[key] = form[key];
  const corpo = typeDef.hasBody ? (form.corpo as string | undefined) : undefined;
  const frontmatter = generateFrontmatterGeneric(fieldOrder, values, corpo);

  if (!isGithubConfigured()) {
    await logAuditEvent({
      utente: user,
      azione: 'error',
      collezione: typeDef.collection,
      entryId: form.slug as string,
      dettagli: { motivo: 'github_non_configurato' },
    });
    return Response.json(
      {
        error: 'github_not_configured',
        message: 'GITHUB_SERVICE_TOKEN non configurato in questo ambiente: impossibile salvare su GitHub.',
        anteprimaFrontmatter: frontmatter,
        path,
      },
      { status: 503 },
    );
  }

  try {
    const commit = await commitContentFile({
      path,
      content: frontmatter,
      message: `${isUpdate ? 'Aggiorna' : 'Crea'} ${typeDef.label.toLowerCase()} "${form[typeDef.titleField]}" (${statoRichiesto}) via pannello admin`,
    });

    await logAuditEvent({
      utente: user,
      azione: isUpdate ? (da !== statoRichiesto ? (statoRichiesto === 'published' ? 'publish' : statoRichiesto === 'archived' ? 'archive' : 'update') : 'update') : 'create',
      collezione: typeDef.collection,
      entryId: form.slug as string,
      dettagli: { statoPrecedente: da, statoNuovo: statoRichiesto, commitSha: commit.commitSha },
    });

    return Response.json({ ok: true, path, commit });
  } catch (err) {
    const message = err instanceof GithubNonConfiguratoError ? err.message : String((err as Error)?.message ?? err);
    await logAuditEvent({
      utente: user,
      azione: 'error',
      collezione: typeDef.collection,
      entryId: form.slug as string,
      dettagli: { motivo: message },
    });
    return Response.json({ error: 'github_write_failed', message }, { status: 502 });
  }
});
