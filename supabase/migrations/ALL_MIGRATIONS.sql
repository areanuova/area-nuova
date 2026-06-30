-- ============================================================
-- ARIS — Migration combinata (tutte e 3 le versioni)
-- Incollare integralmente nel Supabase SQL Editor ed eseguire
-- ============================================================

-- ============================================================
-- ARIS â€” Pipeline RAG per Area Nuova
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

-- Scrittura solo per service_role (bypassa RLS â€” policy formale)
create policy "aris_docs_write"  on aris_documents
  for all using (auth.role() = 'service_role');
create policy "aris_embed_write" on aris_embeddings
  for all using (auth.role() = 'service_role');


-- ────────────────────────── v2 ──────────────────────────

-- Aris v2 â€” aggiornamenti schema
-- Eseguire in Supabase â†’ SQL Editor dopo 20240101000000_aris.sql

-- â”€â”€ 1. Aggiorna aris_search con filtro opzionale per source â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION aris_search(
  query_embedding vector(1536),
  match_count     int     DEFAULT 6,
  sim_threshold   float   DEFAULT 0.40,
  source_filter   text[]  DEFAULT NULL
)
RETURNS TABLE (
  document_id  uuid,
  titolo       text,
  url          text,
  source       text,
  chunk_text   text,
  similarity   float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.titolo,
    d.url,
    d.source,
    e.chunk_text,
    (1 - (e.embedding <=> query_embedding))::float AS similarity
  FROM aris_embeddings e
  JOIN aris_documents  d ON e.document_id = d.id
  WHERE (1 - (e.embedding <=> query_embedding)) > sim_threshold
    AND (source_filter IS NULL OR d.source = ANY(source_filter))
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- â”€â”€ 2. Tabella feedback utenti â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS aris_feedback (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id  text,
  question     text        NOT NULL,
  answer       text        NOT NULL,
  rating       smallint    NOT NULL CHECK (rating IN (-1, 1)),
  sources      jsonb       NOT NULL DEFAULT '[]',
  page_url     text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aris_feedback_rating_idx ON aris_feedback (rating);
CREATE INDEX IF NOT EXISTS aris_feedback_created_idx ON aris_feedback (created_at DESC);

ALTER TABLE aris_feedback ENABLE ROW LEVEL SECURITY;

-- Solo service_role puÃ² leggere e scrivere il feedback
CREATE POLICY "aris_feedback_service_all" ON aris_feedback
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ────────────────────────── v3 ──────────────────────────

-- Aris v3 â€” External Sources Sync
-- Eseguire in Supabase â†’ SQL Editor dopo 20240102000000_aris_v2.sql

-- â”€â”€ 1. Registro sorgenti esterne â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS aris_external_sources (
  id                       text        PRIMARY KEY,
  name                     text        NOT NULL,
  base_url                 text        NOT NULL,
  priority                 int         NOT NULL DEFAULT 80,
  refresh_interval_minutes int         NOT NULL DEFAULT 120,
  last_sync_at             timestamptz,
  is_active                boolean     NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- â”€â”€ 2. Documenti esterni (metadata + freshness) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS aris_external_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    text        NOT NULL REFERENCES aris_external_sources(id) ON DELETE CASCADE,
  url          text        NOT NULL UNIQUE,
  title        text        NOT NULL,
  content      text        NOT NULL,
  excerpt      text        NOT NULL DEFAULT '',
  content_hash text        NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status       text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  metadata     jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aris_ext_docs_source_idx    ON aris_external_documents (source_id);
CREATE INDEX IF NOT EXISTS aris_ext_docs_status_idx    ON aris_external_documents (status);
CREATE INDEX IF NOT EXISTS aris_ext_docs_last_seen_idx ON aris_external_documents (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS aris_ext_docs_title_idx     ON aris_external_documents USING gin(to_tsvector('italian', title));
CREATE INDEX IF NOT EXISTS aris_ext_docs_excerpt_idx   ON aris_external_documents USING gin(to_tsvector('italian', excerpt));

-- Trigger: aggiorna updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aris_external_documents_updated_at ON aris_external_documents;
CREATE TRIGGER aris_external_documents_updated_at
  BEFORE UPDATE ON aris_external_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- â”€â”€ 3. Log sincronizzazioni â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS aris_external_sync_logs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id            text        NOT NULL,
  started_at           timestamptz NOT NULL,
  completed_at         timestamptz,
  pages_fetched        int         NOT NULL DEFAULT 0,
  pages_updated        int         NOT NULL DEFAULT 0,
  pages_skipped        int         NOT NULL DEFAULT 0,
  embeddings_generated int         NOT NULL DEFAULT 0,
  errors               jsonb       NOT NULL DEFAULT '[]',
  status               text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'partial', 'failed')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aris_sync_logs_source_idx  ON aris_external_sync_logs (source_id);
CREATE INDEX IF NOT EXISTS aris_sync_logs_started_idx ON aris_external_sync_logs (started_at DESC);

-- â”€â”€ 4. RLS â€” solo service_role accede â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE aris_external_sources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE aris_external_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE aris_external_sync_logs    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aris_ext_sources_service"
  ON aris_external_sources FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "aris_ext_docs_service"
  ON aris_external_documents FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "aris_ext_logs_service"
  ON aris_external_sync_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- â”€â”€ 5. Seed sorgenti iniziali â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO aris_external_sources (id, name, base_url, priority, refresh_interval_minutes, is_active)
VALUES
  ('external-unifg',  'UniversitÃ  di Foggia (unifg.it)',                 'https://www.unifg.it',       90, 120, true),
  ('external-adisu',  'ADISU Puglia (adisupuglia.it)',                   'https://www.adisupuglia.it', 88,  90, true),
  ('external-mur',    'MUR â€” Ministero UniversitÃ  e Ricerca (mur.gov.it)', 'https://www.mur.gov.it',   85, 240, true)
ON CONFLICT (id) DO NOTHING;

