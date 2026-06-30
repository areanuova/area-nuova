-- ============================================================
-- ARIS — Pipeline RAG per Area Nuova
-- Esegui questa migration nel SQL Editor di Supabase
-- ============================================================

-- 1. Abilita l'estensione pgvector
create extension if not exists vector;

-- 2. Tabella documenti
create table if not exists aris_documents (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,                      -- es. 'guide', 'news', 'convenzioni'
  source_id   text not null,                      -- slug o ID univoco della fonte
  titolo      text not null,
  url         text,                               -- URL relativo sul sito (es. /guide/slug)
  contenuto   text not null,                      -- testo completo del documento
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint aris_documents_source_unique unique (source, source_id)
);

-- 3. Tabella chunks + embeddings
create table if not exists aris_embeddings (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references aris_documents(id) on delete cascade,
  chunk_index  integer not null,
  chunk_text   text not null,
  embedding    vector(1536),                      -- text-embedding-3-small
  created_at   timestamptz not null default now(),
  constraint aris_embeddings_chunk_unique unique (document_id, chunk_index)
);

-- 4. Indice HNSW per ricerca vettoriale veloce
create index if not exists aris_embeddings_hnsw_idx
  on aris_embeddings using hnsw (embedding vector_cosine_ops);

-- 5. Funzione di ricerca semantica
create or replace function aris_search(
  query_embedding vector(1536),
  match_count     int     default 6,
  sim_threshold   float   default 0.40
)
returns table (
  document_id  uuid,
  titolo       text,
  url          text,
  source       text,
  chunk_text   text,
  similarity   float
)
language plpgsql
as $$
begin
  return query
  select
    d.id                                            as document_id,
    d.titolo,
    d.url,
    d.source,
    e.chunk_text,
    (1 - (e.embedding <=> query_embedding))::float  as similarity
  from aris_embeddings e
  join aris_documents  d on e.document_id = d.id
  where (1 - (e.embedding <=> query_embedding)) > sim_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 6. RLS
alter table aris_documents  enable row level security;
alter table aris_embeddings enable row level security;

-- Lettura pubblica (anon + authenticated)
create policy "aris_docs_read"   on aris_documents  for select using (true);
create policy "aris_embed_read"  on aris_embeddings for select using (true);

-- Scrittura solo per service_role (bypassa RLS — policy formale)
create policy "aris_docs_write"  on aris_documents
  for all using (auth.role() = 'service_role');
create policy "aris_embed_write" on aris_embeddings
  for all using (auth.role() = 'service_role');
