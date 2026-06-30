import { getAdminSupabase }    from '../supabase-admin';
import { generateEmbedding }   from '../embeddings';
import { getAllExternalSources } from './registry';
import { fetchPage, loadRobots, clearRobotsCache } from './fetcher';
import { extractLinks }        from './parser';
import { computeHash }         from './dedupe';
import { isStale }             from './freshness';
import type { ExternalSourceDefinition, SyncResult } from './types';

const CHUNK_SIZE    = 1200;
const CHUNK_OVERLAP = 120;

function splitChunks(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end  = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 60) chunks.push(chunk);
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

async function upsertExternalDoc(
  sb:       ReturnType<typeof getAdminSupabase>,
  sourceId: string,
  url:      string,
  title:    string,
  content:  string,
  excerpt:  string,
  hash:     string,
  metadata: Record<string, unknown>,
): Promise<string | null> {
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from('aris_external_documents')
    .upsert(
      { source_id: sourceId, url, title, content, excerpt, content_hash: hash, last_seen_at: now, status: 'active', metadata },
      { onConflict: 'url', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (error) {
    console.error(`[ExternalSync] upsert aris_external_documents: ${error.message}`);
    return null;
  }

  return (data as { id: string } | null)?.id ?? null;
}

async function touchLastSeen(sb: ReturnType<typeof getAdminSupabase>, url: string): Promise<void> {
  await sb
    .from('aris_external_documents')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('url', url);
}

async function upsertArisDocument(
  sb:       ReturnType<typeof getAdminSupabase>,
  sourceId: string,
  url:      string,
  title:    string,
  content:  string,
): Promise<string | null> {
  const { data, error } = await sb
    .from('aris_documents')
    .upsert(
      { source: sourceId, url, titolo: title, contenuto: content.slice(0, 5000), updated_at: new Date().toISOString() },
      { onConflict: 'url', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (error) {
    console.error(`[ExternalSync] upsert aris_documents: ${error.message}`);
    return null;
  }

  return (data as { id: string } | null)?.id ?? null;
}

async function regenerateEmbeddings(
  sb:         ReturnType<typeof getAdminSupabase>,
  documentId: string,
  content:    string,
): Promise<number> {
  await sb.from('aris_embeddings').delete().eq('document_id', documentId);

  const chunks  = splitChunks(content);
  let generated = 0;

  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk);
      const { error } = await sb.from('aris_embeddings').insert({
        document_id: documentId,
        chunk_text:  chunk,
        embedding,
      });
      if (!error) generated++;
    } catch (err) {
      console.error('[ExternalSync] embedding generation failed:', err);
    }
  }

  return generated;
}

async function syncSource(source: ExternalSourceDefinition): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const result: SyncResult = {
    sourceId:            source.id,
    sourceName:          source.name,
    pagesChecked:        0,
    pagesUpdated:        0,
    pagesSkipped:        0,
    embeddingsGenerated: 0,
    errors:              [],
    startedAt,
    completedAt:         '',
    status:              'success',
  };

  const sb = getAdminSupabase();

  // Check if source is stale
  const { data: srcRow } = await sb
    .from('aris_external_sources')
    .select('last_sync_at')
    .eq('id', source.id)
    .maybeSingle();

  if (srcRow && !isStale(srcRow.last_sync_at as string | null, source.refreshIntervalMinutes)) {
    result.status      = 'success';
    result.completedAt = new Date().toISOString();
    return result;
  }

  // Load robots.txt once per source
  const robots = await loadRobots(source.baseUrl);

  // Collect URLs: start from entry points, discover linked pages
  const seen   = new Set<string>();
  const queue  = [...source.getEntryPoints()];
  const toFetch: string[] = [];

  while (toFetch.length < source.maxPagesPerSync && queue.length > 0) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    const allowed = source.allowedPaths.some(p => new URL(url).pathname.startsWith(p));
    const denied  = source.deniedPaths.some(p => new URL(url).pathname.startsWith(p));
    if (!allowed || denied) continue;

    toFetch.push(url);
  }

  // Fetch, parse, dedupe, upsert
  for (const url of toFetch.slice(0, source.maxPagesPerSync)) {
    result.pagesChecked++;

    const fetched = await fetchPage(url, robots, source.allowInsecureTls);

    if (!fetched.ok) {
      if (fetched.error !== 'disallowed by robots.txt') {
        result.errors.push(`${url}: ${fetched.error ?? 'fetch error'}`);
      }
      continue;
    }

    // Discover more links from this page
    if (queue.length < source.maxPagesPerSync * 2) {
      const links = extractLinks(fetched.html, url);
      for (const link of links) {
        if (!seen.has(link)) queue.push(link);
      }
    }

    const page = source.parsePage(fetched.html, url);
    if (!page) { result.pagesSkipped++; continue; }

    const hash = computeHash(page.content);

    // Check existing record
    const { data: existing } = await sb
      .from('aris_external_documents')
      .select('id, content_hash')
      .eq('url', url)
      .maybeSingle();

    const unchanged = existing && (existing as { content_hash: string }).content_hash === hash;

    if (unchanged) {
      await touchLastSeen(sb, url);
      result.pagesSkipped++;
      continue;
    }

    // Content changed — upsert to aris_external_documents
    await upsertExternalDoc(sb, source.id, url, page.title, page.content, page.excerpt, hash, page.metadata);

    // Upsert to aris_documents for RAG + regenerate embeddings
    const docId = await upsertArisDocument(sb, source.id, url, page.title, page.content);
    if (docId) {
      const generated = await regenerateEmbeddings(sb, docId, page.content);
      result.embeddingsGenerated += generated;
    }

    result.pagesUpdated++;
  }

  // Update last_sync_at
  await sb
    .from('aris_external_sources')
    .upsert(
      {
        id:             source.id,
        name:           source.name,
        base_url:       source.baseUrl,
        priority:       source.priority,
        refresh_interval_minutes: source.refreshIntervalMinutes,
        last_sync_at:   new Date().toISOString(),
        is_active:      true,
      },
      { onConflict: 'id' },
    );

  // Write sync log
  result.completedAt = new Date().toISOString();
  result.status      = result.errors.length === 0 ? 'success' : (result.pagesUpdated > 0 ? 'partial' : 'failed');

  await sb.from('aris_external_sync_logs').insert({
    source_id:            source.id,
    started_at:           result.startedAt,
    completed_at:         result.completedAt,
    pages_fetched:        result.pagesChecked,
    pages_updated:        result.pagesUpdated,
    pages_skipped:        result.pagesSkipped,
    embeddings_generated: result.embeddingsGenerated,
    errors:               result.errors,
    status:               result.status,
  });

  return result;
}

export async function syncAllSources(sourceIds?: string[]): Promise<SyncResult[]> {
  clearRobotsCache();
  const sources = getAllExternalSources().filter(
    s => !sourceIds || sourceIds.includes(s.id),
  );

  const results: SyncResult[] = [];
  for (const source of sources) {
    try {
      const r = await syncSource(source);
      results.push(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ExternalSync] source ${source.id} failed:`, msg);
      results.push({
        sourceId:            source.id,
        sourceName:          source.name,
        pagesChecked:        0,
        pagesUpdated:        0,
        pagesSkipped:        0,
        embeddingsGenerated: 0,
        errors:              [msg],
        startedAt:           new Date().toISOString(),
        completedAt:         new Date().toISOString(),
        status:              'failed',
      });
    }
  }

  return results;
}
