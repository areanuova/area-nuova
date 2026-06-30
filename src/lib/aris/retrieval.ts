import { getAdminSupabase } from './supabase-admin';
import { getAIProvider } from './ai/provider';
import { ARIS_CONFIG } from './config';
import type { RetrievedChunk } from './types';

export async function retrieveRelevantChunks(
  query: string,
  limit: number = ARIS_CONFIG.maxChunks,
  sourceFilter: string[] | null = null,
): Promise<RetrievedChunk[]> {
  const provider = getAIProvider();
  let embedding: number[];
  try {
    embedding = await provider.generateEmbedding(query);
  } catch (err) {
    // Provider corrente (es. Gemini) non supporta embedding — RAG non disponibile
    console.warn('[Aris retrieval]', err instanceof Error ? err.message : err);
    return [];
  }
  const supabase  = getAdminSupabase();

  const { data, error } = await supabase.rpc('aris_search', {
    query_embedding: embedding,
    match_count:     limit,
    sim_threshold:   ARIS_CONFIG.similarityThreshold,
    source_filter:   sourceFilter,
  });

  if (error) {
    console.error('[Aris retrieval]', error.message);
    return [];
  }

  return (data ?? []) as RetrievedChunk[];
}
