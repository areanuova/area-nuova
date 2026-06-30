-- Aris v2 — aggiornamenti schema
-- Eseguire in Supabase → SQL Editor dopo 20240101000000_aris.sql

-- ── 1. Aggiorna aris_search con filtro opzionale per source ─────────────
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

-- ── 2. Tabella feedback utenti ───────────────────────────────────────────
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

-- Solo service_role può leggere e scrivere il feedback
CREATE POLICY "aris_feedback_service_all" ON aris_feedback
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
