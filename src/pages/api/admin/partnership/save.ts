// POST /api/admin/partnership/save — crea o aggiorna una Partnership.
// Unico punto di scrittura per questa collection: gestisce validazione,
// controllo permessi/transizioni di stato, generazione frontmatter e
// commit GitHub. Nessuna scrittura diretta su disco: in questo ambiente
// (Vercel serverless) il filesystem del deploy è read-only e comunque
// effimero — l'unica sorgente di verità persistente è il repository Git,
// coerente con l'architettura approvata.
export const prerender = false;

import type { APIContext } from 'astro';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { canTransition, canEditContent, type ContentStato } from '../../../../lib/admin/roles';
import { logAuditEvent } from '../../../../lib/admin/audit';
import {
  partnershipFormSchema,
  contentFilePath,
  generateFrontmatter,
} from '../../../../lib/admin/validation';
import { commitContentFile, isGithubConfigured, GithubNonConfiguratoError } from '../../../../lib/admin/github';

export async function POST({ request }: APIContext): Promise<Response> {
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

  // `statoPrecedente` non fa parte dello schema del form: è un campo di
  // controllo separato, inviato solo quando si modifica un contenuto
  // esistente, usato per verificare la transizione di stato richiesta.
  const statoPrecedente = (payload as any)?.statoPrecedente as ContentStato | undefined;
  const isUpdate = typeof statoPrecedente === 'string';

  const parsed = partnershipFormSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: 'validation_error', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    );
  }
  const form = parsed.data;

  // Controllo transizione: per una creazione, la transizione "virtuale" è
  // draft → stato-richiesto (un editor può quindi solo creare in draft; un
  // admin/super_admin può creare direttamente in qualunque stato).
  const da = isUpdate ? statoPrecedente : 'draft';
  if (!canTransition(user.role, da, form.stato)) {
    return Response.json(
      {
        error: 'invalid_transition',
        message: `Il ruolo "${user.role}" non può portare il contenuto da "${da}" a "${form.stato}".`,
      },
      { status: 403 },
    );
  }

  let path: string;
  try {
    path = contentFilePath(form.slug);
  } catch (err) {
    return Response.json({ error: 'invalid_slug', message: String((err as Error).message) }, { status: 400 });
  }

  const frontmatter = generateFrontmatter(form);

  if (!isGithubConfigured()) {
    // Non simuliamo un salvataggio riuscito. Il contenuto è validato e
    // pronto (frontmatter generato, mostrato all'operatore per trasparenza),
    // ma non pubblicato. Registriamo comunque il tentativo nell'audit log,
    // se disponibile, come 'error' — utile per capire quante volte questo
    // blocco impedisce operazioni reali.
    await logAuditEvent({
      utente: user,
      azione: 'error',
      collezione: 'partnership',
      entryId: form.slug,
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
      message: `${isUpdate ? 'Aggiorna' : 'Crea'} partnership "${form.nome}" (${form.stato}) via pannello admin`,
    });

    await logAuditEvent({
      utente: user,
      azione: isUpdate ? (da !== form.stato ? (form.stato === 'published' ? 'publish' : form.stato === 'archived' ? 'archive' : 'update') : 'update') : 'create',
      collezione: 'partnership',
      entryId: form.slug,
      dettagli: { statoPrecedente: da, statoNuovo: form.stato, commitSha: commit.commitSha },
    });

    return Response.json({ ok: true, path, commit });
  } catch (err) {
    const message = err instanceof GithubNonConfiguratoError ? err.message : String((err as Error)?.message ?? err);
    await logAuditEvent({
      utente: user,
      azione: 'error',
      collezione: 'partnership',
      entryId: form.slug,
      dettagli: { motivo: message },
    });
    return Response.json({ error: 'github_write_failed', message }, { status: 502 });
  }
}
