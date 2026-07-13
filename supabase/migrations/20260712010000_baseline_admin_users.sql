-- ============================================================
-- BASELINE DOCUMENTALE — admin_users
-- Sprint 2.1 (bozza) → Sprint 2.2 (schema verificato) → Sprint 2.3
-- (RLS e policy DEFINITIVAMENTE verificate via lettura diretta di
-- pg_policies/pg_proc nel SQL Editor Supabase — non più dedotte da
-- test comportamentali indiretti). Vedi docs/SUPABASE_REMOTE_AUDIT.md.
--
-- ⚠️  NON APPLICARE AUTOMATICAMENTE. La struttura (SEZIONE 1) è sicura
--     da rieseguire (IF NOT EXISTS ovunque). La SEZIONE 2 è ormai
--     puramente documentale: la policy reale esiste già con un nome
--     diverso — vedi nota.
-- ============================================================

-- ------------------------------------------------------------
-- SEZIONE 1 — Struttura, VERIFICATA contro lo schema remoto reale
-- ------------------------------------------------------------
create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(), -- VERIFICATO
  email      text not null,                               -- VERIFICATO
  created_at timestamptz default now()                     -- VERIFICATO, nullable
);

-- Vincolo di unicità su email: ancora non verificabile col metodo usato
-- in questo repository (introspezione via PostgREST/pg_policies non
-- copre i constraint univoci su colonne non-PK). Resta una proposta.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'admin_users_email_key'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users add constraint admin_users_email_key unique (email);
  end if;
end $$;

-- ------------------------------------------------------------
-- SEZIONE 2 — RLS: DEFINITIVAMENTE VERIFICATA (Sprint 2.3)
-- ------------------------------------------------------------
--
-- CONFERMATO leggendo pg_class.relrowsecurity: RLS è attiva su
-- admin_users (relrowsecurity = true). `relforcerowsecurity = false` è
-- il valore normale e atteso in questo scenario: forza RLS anche per il
-- proprietario/superuser della tabella, cosa irrilevante qui perché
-- l'applicazione non si connette mai come proprietario della tabella —
-- usa solo il ruolo `anon`/`authenticated` (soggetti a RLS per design)
-- o `service_role` (bypassa RLS per contratto Supabase, non per
-- proprietà della tabella). Impostarlo a true non cambierebbe nulla per
-- questa applicazione.
alter table public.admin_users enable row level security;

-- CONFERMATO leggendo pg_policies: esiste già una policy equivalente,
-- con un nome diverso da quello proposto nello Sprint 2.1:
--
--   nome reale:  "Admin: SELECT proprio record"
--   comando:     SELECT
--   ruoli:       {authenticated}
--   USING:       (email = auth.email())
--
-- Usa l'helper `auth.email()` invece di `auth.jwt() ->> 'email'` come
-- proposto nello Sprint 2.1 — equivalenti nella sostanza. La policy
-- proposta in quello sprint NON viene più creata qui: applicarla
-- creerebbe una seconda policy PERMISSIVE ridondante (stesso identico
-- effetto, nome diverso) — PostgreSQL le combinerebbe con OR senza
-- causare danni, ma è inutile duplicazione. Questa sezione resta quindi
-- solo a scopo di documentazione, non contiene più un DO-block
-- eseguibile.
--
-- Nessuna policy INSERT/UPDATE/DELETE reale osservata: la gestione
-- admin (aggiungere/rimuovere righe) resta riservata alla service role
-- finché non esiste un pannello CMS dedicato (vedi docs/CMS_ARCHITECTURE.md).
