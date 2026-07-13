// POST /api/admin/contenuti/gruppi-whatsapp/import — importazione massiva.
// Due modalità obbligatorie, mai fuse in una sola chiamata:
//   - "preview": valida e classifica ogni riga (valida/non valida/duplicata),
//     NESSUNA scrittura. È l'unico modo per vedere il risultato prima di
//     impegnarsi a un commit reale.
//   - "commit": rivalida da zero (mai fidarsi della sola preview del
//     client) e scrive solo le righe valide e non duplicate, sempre come
//     `stato: 'draft'` indipendentemente da cosa conteneva la riga — un
//     import non pubblica mai automaticamente contenuti reali.
export const prerender = false;

import type { APIContext } from 'astro';
import { z } from 'astro:content';
import { getCollection } from 'astro:content';
import { requireAdminUser } from '../../../../../lib/admin/auth-server';
import { canEditContent } from '../../../../../lib/admin/roles';
import { logAuditEvent } from '../../../../../lib/admin/audit';
import { contentFilePathGeneric, generateFrontmatterGeneric, slugify } from '../../../../../lib/admin/content-utils';
import { buildContentSchema } from '../../../../../lib/admin/validation-generic';
import { CONTENT_TYPES } from '../../../../../lib/admin/content-types';
import { commitContentFile, isGithubConfigured } from '../../../../../lib/admin/github';
import { withErrorHandling } from '../../../../../lib/admin/api-handler';

const typeDef = CONTENT_TYPES['gruppi-whatsapp'];
const schema = buildContentSchema(typeDef);

const bodySchema = z.object({
  mode: z.enum(['preview', 'commit']),
  rows: z.array(z.record(z.string(), z.unknown())).max(500),
});

function normalizeRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if (typeof out.corsi === 'string') {
    out.corsi = out.corsi.split('|').map((v) => v.trim()).filter(Boolean);
  } else if (!Array.isArray(out.corsi)) {
    out.corsi = [];
  }
  for (const field of typeDef.fields) {
    if (field.type === 'boolean' && typeof out[field.key] === 'string') {
      out[field.key] = ['true', '1', 'si', 'sì', 'yes'].includes((out[field.key] as string).toLowerCase());
    }
    if (field.type === 'number' && typeof out[field.key] === 'string') {
      const n = Number(out[field.key]);
      out[field.key] = Number.isFinite(n) ? n : field.default ?? 0;
    }
  }
  if (!out.slug || typeof out.slug !== 'string' || out.slug.trim() === '') {
    out.slug = slugify(String(out.titolo ?? ''));
  } else {
    out.slug = slugify(String(out.slug));
  }
  return out;
}

export const POST = withErrorHandling(async ({ request }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }
  if (!canEditContent(auth.user.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsedBody = bodySchema.safeParse(payload);
  if (!parsedBody.success) {
    return Response.json({ error: 'validation_error', issues: parsedBody.error.issues }, { status: 400 });
  }
  const { mode, rows } = parsedBody.data;

  const esistenti = new Set<string>((await getCollection('gruppi-whatsapp')).map((e): string => e.slug));
  const vistiInBatch = new Set<string>();

  const valide: { slug: string; form: Record<string, unknown>; corpo: string }[] = [];
  const nonValide: { riga: number; slug: string | null; errori: string[] }[] = [];
  const duplicate: { riga: number; slug: string; motivo: 'esistente' | 'ripetuta_nel_file' }[] = [];

  rows.forEach((raw, idx) => {
    const normalizzata = normalizeRow(raw as Record<string, unknown>);
    const slug = normalizzata.slug as string;
    const corpo = typeof (raw as any).corpo === 'string' ? (raw as any).corpo : '';

    const parsed = schema.safeParse(normalizzata);
    if (!parsed.success) {
      nonValide.push({ riga: idx + 1, slug: slug || null, errori: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      return;
    }
    if (esistenti.has(slug)) {
      duplicate.push({ riga: idx + 1, slug, motivo: 'esistente' });
      return;
    }
    if (vistiInBatch.has(slug)) {
      duplicate.push({ riga: idx + 1, slug, motivo: 'ripetuta_nel_file' });
      return;
    }
    vistiInBatch.add(slug);
    valide.push({ slug, form: parsed.data as Record<string, unknown>, corpo });
  });

  if (mode === 'preview') {
    return Response.json({
      totale: rows.length,
      valide: valide.map((v) => ({ slug: v.slug, titolo: v.form.titolo })),
      nonValide,
      duplicate,
    });
  }

  // mode === 'commit'
  if (!isGithubConfigured()) {
    return Response.json({ error: 'github_not_configured', message: 'GITHUB_SERVICE_TOKEN non configurato: impossibile importare.' }, { status: 503 });
  }

  const importati: { slug: string; commitSha: string }[] = [];
  const falliti: { slug: string; errore: string }[] = [];

  for (const riga of valide) {
    try {
      const fieldOrder = typeDef.fields.map((f) => f.key);
      const values: Record<string, unknown> = {};
      for (const key of fieldOrder) values[key] = key === typeDef.statoField ? 'draft' : riga.form[key];
      const frontmatter = generateFrontmatterGeneric(fieldOrder, values as any, riga.corpo);
      const path = contentFilePathGeneric(typeDef.collectionDir, riga.slug);
      const commit = await commitContentFile({
        path,
        content: frontmatter,
        message: `Importa gruppo WhatsApp "${riga.form.titolo}" (draft) via importazione massiva`,
      });
      importati.push({ slug: riga.slug, commitSha: commit.commitSha });
      await logAuditEvent({
        utente: auth.user,
        azione: 'create',
        collezione: 'gruppi-whatsapp',
        entryId: riga.slug,
        dettagli: { motivo: 'importazione_massiva', commitSha: commit.commitSha },
      });
    } catch (err) {
      falliti.push({ slug: riga.slug, errore: String((err as Error)?.message ?? err) });
    }
  }

  return Response.json({ importati, falliti, nonValide, duplicate });
});
