# Audit Sprint 2.2 — non applicare, non deployare

Questa cartella (prefisso `_`, fuori da `supabase/migrations/`) contiene solo
l'estratto **schema** (colonne, tipi, nullable, default) delle tabelle
`alloggi` e `admin_users`, ottenuto in sola lettura via
`GET {SUPABASE_URL}/rest/v1/` con la service role key il 2026-07-12.

Nessun dato di riga (nessun contenuto reale di annunci o email admin) è
incluso in questo file — solo la definizione delle colonne. I risultati dei
test comportamentali RLS (conteggi righe restituite ad anon vs service role)
sono riportati in forma aggregata in `docs/SUPABASE_REMOTE_AUDIT.md`, non qui.

Non fa parte delle migration: `supabase db push`/`migration up` non la tocca.
