-- ============================================================
-- CMS Sprint 3 — Ruoli amministrativi (Super Admin / Admin / Editor)
-- PROPOSTA — non ancora eseguita. Da lanciare nel SQL Editor di
-- Supabase solo quando si avvia l'implementazione dello Sprint 3.
--
-- Estende la tabella `admin_users` (oggi usata solo da /admin/alloggi
-- come semplice allow-list flat: id, email) con un sistema di ruoli,
-- così da poter rimuovere l'ADMIN_EMAIL hardcoded nel frontend e
-- sostituirlo con un controllo di ruolo lato DB (RLS), riutilizzabile
-- da qualsiasi nuova sezione del CMS (News, Mozioni, Guide, ecc.).
-- ============================================================

-- 1. Enum dei ruoli
do $$ begin
  create type cms_role as enum ('super_admin', 'admin', 'editor');
exception
  when duplicate_object then null;
end $$;

-- 2. Colonne aggiuntive su admin_users (idempotente)
alter table admin_users
  add column if not exists role cms_role not null default 'editor',
  add column if not exists nome text,
  add column if not exists attivo boolean not null default true,
  add column if not exists creato_da uuid references admin_users(id),
  add column if not exists created_at timestamptz not null default now();

-- 3. Il primo admin storico diventa super_admin (da adattare all'email reale)
update admin_users set role = 'super_admin' where email = 'areanuova@unifg.it';

-- 4. Tabella di audit: traccia chi modifica cosa (obbligatoria per un CMS multi-utente)
create table if not exists cms_audit_log (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references admin_users(id),
  azione       text not null,              -- 'create' | 'update' | 'delete' | 'publish'
  collezione   text not null,              -- 'news' | 'guide' | 'convenzioni' | 'alloggi' | ...
  entry_id     text not null,              -- slug o id della entry modificata
  dettagli     jsonb default '{}',
  created_at   timestamptz not null default now()
);

-- 5. RLS: solo utenti autenticati presenti in admin_users (e attivi) possono leggere/scrivere
alter table admin_users enable row level security;
alter table cms_audit_log enable row level security;

drop policy if exists "admin_users leggibile da admin autenticati" on admin_users;
create policy "admin_users leggibile da admin autenticati"
  on admin_users for select
  using (auth.jwt() ->> 'email' in (select email from admin_users where attivo));

-- Solo i super_admin possono inserire/modificare/rimuovere altri admin
drop policy if exists "solo super_admin gestisce admin_users" on admin_users;
create policy "solo super_admin gestisce admin_users"
  on admin_users for all
  using (
    auth.jwt() ->> 'email' in (
      select email from admin_users where role = 'super_admin' and attivo
    )
  );

drop policy if exists "audit log leggibile da admin autenticati" on cms_audit_log;
create policy "audit log leggibile da admin autenticati"
  on cms_audit_log for select
  using (auth.jwt() ->> 'email' in (select email from admin_users where attivo));

drop policy if exists "audit log scrivibile da admin autenticati" on cms_audit_log;
create policy "audit log scrivibile da admin autenticati"
  on cms_audit_log for insert
  with check (auth.jwt() ->> 'email' in (select email from admin_users where attivo));

-- ============================================================
-- Nota: le policy RLS granulari per-collezione (es. "editor può
-- creare bozze ma non pubblicare") vanno definite quando si
-- introducono le tabelle di contenuto vere e proprie (vedi
-- docs/CMS_ARCHITECTURE.md, sezione "Storage per tipo di contenuto").
-- ============================================================
