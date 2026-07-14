// POST /api/admin/contenuti/{tipo}/bulk — operazioni massive sulla lista
// (Sprint 5.0B, Fase 5): cambio stato multiplo, archiviazione multipla,
// duplicazione. Ogni riga è processata e committata singolarmente (un
// commit Git per file, come ovunque nel CMS) e il risultato riporta
// successi/fallimenti per singolo slug — mai un "tutto o niente" silenzioso
// che nasconda quali elementi sono realmente cambiati.
export const prerender = false;

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { requireAdminUser } from '../../../../../lib/admin/auth-server';
import { canTransition, canEditContent, type ContentStato } from '../../../../../lib/admin/roles';
import { logAuditEvent } from '../../../../../lib/admin/audit';
import { contentFilePathGeneric, generateFrontmatterGeneric, isSafeSlug, slugify } from '../../../../../lib/admin/content-utils';
import { getContentType } from '../../../../../lib/admin/content-types';
import { commitContentFile, isGithubConfigured } from '../../../../../lib/admin/github';
import { withErrorHandling } from '../../../../../lib/admin/api-handler';

interface RigaEsito { slug: string; ok: boolean; messaggio?: string; nuovoSlug?: string }

export const POST = withErrorHandling(async ({ request, params }: APIContext): Promise<Response> => {
  const typeDef = getContentType(params.tipo ?? '');
  if (!typeDef) return Response.json({ error: 'unknown_content_type' }, { status: 404 });

  const auth = await requireAdminUser(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status });
  const { user } = auth;
  if (!canEditContent(user.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!isGithubConfigured()) {
    return Response.json({ error: 'github_not_configured', message: 'GITHUB_SERVICE_TOKEN non configurato: impossibile applicare modifiche massive.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as { slugs?: string[]; azione?: 'transition' | 'duplicate'; nuovoStato?: string } | null;
  if (!body?.slugs?.length || !body.azione) {
    return Response.json({ error: 'invalid_request', message: 'slugs e azione sono obbligatori.' }, { status: 400 });
  }
  if (body.slugs.length > 50) {
    return Response.json({ error: 'troppi_elementi', message: 'Massimo 50 elementi per operazione massiva.' }, { status: 400 });
  }
  if (body.azione === 'transition' && !body.nuovoStato) {
    return Response.json({ error: 'invalid_request', message: 'nuovoStato obbligatorio per azione transition.' }, { status: 400 });
  }

  const entries = await getCollection(typeDef.collection as any);
  const entryBySlug = new Map((entries as any[]).map((e) => [e.slug, e]));
  const esistenti = new Set<string>((entries as any[]).map((e) => e.slug as string));
  const statoField = typeDef.statoField;
  const fieldOrder = typeDef.fields.map((f) => f.key);

  const risultati: RigaEsito[] = [];

  for (const slug of body.slugs) {
    const entry = entryBySlug.get(slug);
    if (!entry) {
      risultati.push({ slug, ok: false, messaggio: 'Non trovato nello snapshot corrente.' });
      continue;
    }

    try {
      if (body.azione === 'transition') {
        const statoAttuale = entry.data[statoField] as ContentStato;
        const statoRichiesto = body.nuovoStato as ContentStato;
        if (!canTransition(user.role, statoAttuale, statoRichiesto)) {
          risultati.push({ slug, ok: false, messaggio: `Transizione ${statoAttuale} → ${statoRichiesto} non consentita al tuo ruolo.` });
          continue;
        }
        const path = contentFilePathGeneric(typeDef.collectionDir, slug);
        const values: Record<string, any> = { ...entry.data, [statoField]: statoRichiesto };
        const frontmatter = generateFrontmatterGeneric(fieldOrder, values, typeDef.hasBody ? entry.body : undefined);
        const commit = await commitContentFile({
          path, content: frontmatter,
          message: `Operazione massiva: ${slug} → ${statoRichiesto} via pannello admin`,
        });
        await logAuditEvent({
          utente: user, azione: 'bulk_update', collezione: typeDef.collection, entryId: slug,
          dettagli: { statoPrecedente: statoAttuale, statoNuovo: statoRichiesto, commitSha: commit.commitSha },
        });
        risultati.push({ slug, ok: true });
      } else {
        // duplicate
        let nuovoSlug = slugify(`${slug}-copia`);
        let contatore = 2;
        while (esistenti.has(nuovoSlug)) {
          nuovoSlug = slugify(`${slug}-copia-${contatore}`);
          contatore++;
        }
        if (!isSafeSlug(nuovoSlug)) {
          risultati.push({ slug, ok: false, messaggio: 'Impossibile generare uno slug valido per la copia.' });
          continue;
        }
        const path = contentFilePathGeneric(typeDef.collectionDir, nuovoSlug);
        const titleField = typeDef.titleField;
        const values: Record<string, any> = { ...entry.data, [statoField]: 'draft' };
        values[titleField] = `${entry.data[titleField]} (copia)`;
        const frontmatter = generateFrontmatterGeneric(fieldOrder, values, typeDef.hasBody ? entry.body : undefined);
        const commit = await commitContentFile({
          path, content: frontmatter,
          message: `Duplica "${entry.data[titleField]}" → ${nuovoSlug} (draft) via pannello admin`,
        });
        await logAuditEvent({
          utente: user, azione: 'duplicate', collezione: typeDef.collection, entryId: nuovoSlug,
          dettagli: { originaleSlug: slug, commitSha: commit.commitSha },
        });
        esistenti.add(nuovoSlug);
        risultati.push({ slug, ok: true, nuovoSlug });
      }
    } catch (err) {
      risultati.push({ slug, ok: false, messaggio: String((err as Error)?.message ?? err) });
    }
  }

  const successi = risultati.filter((r) => r.ok).length;
  return Response.json({ ok: true, successi, falliti: risultati.length - successi, risultati });
});
