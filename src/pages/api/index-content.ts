export const prerender = false;

import type { APIContext } from 'astro';
import { getAdminSupabase } from '../../lib/aris/supabase-admin';
import { generateEmbedding } from '../../lib/aris/embeddings';
import { splitIntoChunks } from '../../lib/aris/chunks';
import { rateLimit, getClientIp } from '../../lib/aris/security';
import { ARIS_CONFIG } from '../../lib/aris/config';
import type { ArisDocument } from '../../lib/aris/types';

export async function POST({ request }: APIContext): Promise<Response> {
  // Auth via header
  const adminKey = import.meta.env.ARIS_ADMIN_KEY;
  if (adminKey) {
    const auth = request.headers.get('Authorization') ?? '';
    if (auth !== `Bearer ${adminKey}`) {
      return Response.json({ error: 'Non autorizzato.' }, { status: 401 });
    }
  }

  const ip = getClientIp(request);
  const rl = rateLimit(
    `index:${ip}`,
    ARIS_CONFIG.rateLimit.index.requests,
    ARIS_CONFIG.rateLimit.index.windowMs,
  );
  if (!rl.allowed) {
    return Response.json({ error: 'Troppe richieste.' }, { status: 429 });
  }

  let doc: ArisDocument;
  try {
    doc = (await request.json()) as ArisDocument;
  } catch {
    return Response.json({ error: 'JSON non valido.' }, { status: 400 });
  }

  if (!doc.source || !doc.source_id || !doc.titolo || !doc.contenuto) {
    return Response.json(
      { error: 'Campi obbligatori: source, source_id, titolo, contenuto.' },
      { status: 400 },
    );
  }

  try {
    const sb = getAdminSupabase();

    // Upsert document
    const { data: docRow, error: docErr } = await sb
      .from('aris_documents')
      .upsert(
        {
          source:     doc.source,
          source_id:  doc.source_id,
          titolo:     doc.titolo,
          url:        doc.url ?? null,
          contenuto:  doc.contenuto,
          metadata:   doc.metadata ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source,source_id' },
      )
      .select('id')
      .single();

    if (docErr || !docRow) {
      return Response.json(
        { error: docErr?.message ?? 'Errore salvataggio documento.' },
        { status: 500 },
      );
    }

    const docId = docRow.id as string;

    // Rimuovi embeddings vecchi
    await sb.from('aris_embeddings').delete().eq('document_id', docId);

    // Genera chunk + embeddings
    const chunks = splitIntoChunks(
      doc.contenuto,
      ARIS_CONFIG.chunkSize,
      ARIS_CONFIG.chunkOverlap,
    );
    let indexed = 0;
    let errors  = 0;

    for (let i = 0; i < chunks.length; i++) {
      try {
        const emb = await generateEmbedding(chunks[i]);
        const { error: embErr } = await sb.from('aris_embeddings').insert({
          document_id: docId,
          chunk_index: i,
          chunk_text:  chunks[i],
          embedding:   emb,
        });
        if (embErr) throw embErr;
        indexed++;
      } catch (chunkErr) {
        errors++;
        console.error(`[/api/index-content] chunk ${i} di "${doc.source}/${doc.source_id}":`, chunkErr);
      }
    }

    return Response.json({ ok: true, document_id: docId, indexed, errors });
  } catch (err) {
    console.error('[/api/index-content]', err);
    return Response.json({ error: 'Errore interno.' }, { status: 500 });
  }
}
