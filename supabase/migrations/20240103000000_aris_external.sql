-- Aris v3 — External Sources Sync
-- Eseguire in Supabase → SQL Editor dopo 20240102000000_aris_v2.sql

-- ── 1. Registro sorgenti esterne ─────────────────────────────────────────────
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

-- ── 2. Documenti esterni (metadata + freshness) ───────────────────────────────
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

-- ── 3. Log sincronizzazioni ───────────────────────────────────────────────────
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

-- ── 4. RLS — solo service_role accede ────────────────────────────────────────
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

-- ── 5. Seed sorgenti iniziali ─────────────────────────────────────────────────
INSERT INTO aris_external_sources (id, name, base_url, priority, refresh_interval_minutes, is_active)
VALUES
  ('external-unifg',  'Università di Foggia (unifg.it)',                 'https://www.unifg.it',       90, 120, true),
  ('external-adisu',  'ADISU Puglia (adisupuglia.it)',                   'https://www.adisupuglia.it', 88,  90, true),
  ('external-mur',    'MUR — Ministero Università e Ricerca (mur.gov.it)', 'https://www.mur.gov.it',   85, 240, true)
ON CONFLICT (id) DO NOTHING;
