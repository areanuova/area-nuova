-- ============================================================
-- CMS — Ruoli amministrativi (Super Admin / Admin / Editor)
-- APPLICATA (Sprint 3.1, eseguita manualmente nel SQL Editor Supabase).
-- Lo Sprint 3 aveva implementato il pannello CMS pilota (Partnership) in
-- "modalità compatibilità" perché questa migration non era applicabile in
-- quegli ambienti (nessun canale di esecuzione DDL disponibile — non una
-- scelta, un limite tecnico reale, vedi docs/CMS_SPRINT_3.md per il
-- contesto storico). File mantenuto invariato dopo l'applicazione, come da
-- convenzione del repository (nessuna migration modificata post-esecuzione).
--
-- Scritta nello Sprint 2.0, corretta nello Sprint 3 dopo l'audit remoto
-- reale (docs/SUPABASE_REMOTE_AUDIT.md, Sprint 2.2-2.3) che aveva
-- rivelato 3 incompatibilità con questo file, ora risolte:
--   1. Usava `drop policy if exists` — vietato dalla convenzione
--      stabilita dallo Sprint 2.1 in poi (nessun DROP nelle migration
--      di questo repository). Sostituito con il pattern DO-block
--      "crea solo se assente per nome" usato altrove.
--   2. `add column if not exists created_at ...` era un no-op silenzioso
--      e fuorviante: `created_at` esiste già su admin_users (verificato
--      nello Sprint 2.2) — rimosso dalla ALTER TABLE.
--   3. Le policy reimplementavano da zero la logica "è un admin?" con
--      una subquery inline, invece di riusare `public.is_admin()` —
--      funzione reale scoperta e verificata nello Sprint 2.2/2.3
--      (STABLE, SECURITY DEFINER, search_path fissato a 'public',
--      corpo: `exists(select 1 from admin_users where email =
--      auth.email())`). Le policy sotto ora la richiamano invece di
--      duplicarne la logica, riducendo il rischio che le due
--      implementazioni divergano nel tempo.
--
-- Correzione Sprint 3.1: questo file conteneva in precedenza una singola
-- riga `update admin_users set role = 'super_admin' where email =
-- '<email reale>'` — un indirizzo email reale hardcoded in un file
-- versionato. Rimossa da qui: il bootstrap del primo super_admin è ora
-- un'operazione separata, manuale, mai committata con un valore reale
-- (vedi supabase/_bootstrap/bootstrap_super_admin.sql, che usa un
-- placeholder esplicito da sostituire solo nell'SQL Editor, mai nel file
-- tracciato). Questa migration resta quindi solo infrastruttura di ruoli
-- (enum, colonne, tabella audit, policy) — nessuna promozione utente
-- specifica al suo interno.
--
-- Estende la tabella `admin_users` (oggi usata solo da /admin/alloggi
-- come semplice allow-list flat: id, email, created_at) con un sistema
-- di ruoli, così da poter rimuovere l'ADMIN_EMAIL hardcoded nel
-- frontend e sostituirlo con un controllo di ruolo lato DB (RLS),
-- riutilizzabile da qualsiasi nuova sezione del CMS (News, Mozioni,
-- Guide, ecc.).
-- ============================================================

-- 1. Enum dei ruoli
do $$ begin
  create type cms_role as enum ('super_admin', 'admin', 'editor');
exception
  when duplicate_object then null;
end $$;

-- 2. Colonne aggiuntive su admin_users (idempotente).
--    NON include più created_at (esiste già, verificato Sprint 2.2).
alter table admin_users
  add column if not exists role cms_role not null default 'editor',
  add column if not exists nome text,
  add column if not exists attivo boolean not null default true,
  add column if not exists creato_da uuid references admin_users(id);

-- 3. Il bootstrap del primo super_admin NON è in questo file (Sprint 3.1,
--    vedi nota in testa al file) — eseguire separatamente
--    supabase/_bootstrap/bootstrap_super_admin.sql dopo questa migration.

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

-- admin_users: lettura per ogni admin attivo (non solo la propria riga —
-- più permissiva della policy reale attuale "Admin: SELECT proprio
-- record", perché un pannello CMS con ruoli deve poter mostrare l'elenco
-- di tutti gli admin a chi gestisce gli utenti). Creata solo se assente.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_users'
      and policyname = 'cms_admin_users_read_if_active_admin'
  ) then
    create policy "cms_admin_users_read_if_active_admin"
      on admin_users for select
      using (is_admin() and (select attivo from admin_users where email = auth.email()));
  end if;
end $$;

-- Solo i super_admin attivi possono inserire/modificare/rimuovere altri admin.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_users'
      and policyname = 'cms_admin_users_manage_if_super_admin'
  ) then
    create policy "cms_admin_users_manage_if_super_admin"
      on admin_users for all
      using (exists (
        select 1 from admin_users au
        where au.email = auth.email() and au.role = 'super_admin' and au.attivo
      ));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cms_audit_log'
      and policyname = 'cms_audit_log_read_if_active_admin'
  ) then
    create policy "cms_audit_log_read_if_active_admin"
      on cms_audit_log for select
      using (is_admin() and (select attivo from admin_users where email = auth.email()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cms_audit_log'
      and policyname = 'cms_audit_log_write_if_active_admin'
  ) then
    create policy "cms_audit_log_write_if_active_admin"
      on cms_audit_log for insert
      with check (is_admin() and (select attivo from admin_users where email = auth.email()));
  end if;
end $$;

-- ============================================================
-- Nota: la policy reale "Admin: SELECT proprio record" su admin_users
-- (verificata Sprint 2.3) resta attiva anche dopo questa migration —
-- PostgreSQL combina più policy PERMISSIVE per lo stesso comando con OR,
-- quindi "cms_admin_users_read_if_active_admin" AMPLIA l'accesso in
-- lettura (da "solo la propria riga" a "tutte le righe se admin attivo"),
-- non lo restringe. Verificare che questo sia l'effetto voluto prima di
-- applicare — è un cambio di postura deliberato per un pannello CMS con
-- gestione utenti, non un errore.
--
-- Le policy RLS granulari per-collezione (es. "editor può creare bozze
-- ma non pubblicare") vanno definite quando si introducono le tabelle di
-- contenuto vere e proprie (vedi docs/CMS_ARCHITECTURE.md, sezione
-- "Storage per tipo di contenuto").
-- ============================================================

-- ============================================================
-- VERIFICA (sola lettura) — eseguire subito dopo la migration per
-- confermare che sia stata applicata correttamente. Nessuna di queste
-- query scrive dati. Atteso, riga per riga:
--   1) 'cms_role' presente tra gli enum di tipo
--   2) admin_users ha le 4 colonne nuove (role, nome, attivo, creato_da)
--   3) cms_audit_log esiste
--   4) RLS attiva su admin_users e cms_audit_log (relrowsecurity = true)
--   5) le 4 policy nuove esistono, con il nome esatto atteso
--   6) admin_users: nessuna riga è già super_admin (atteso prima del
--      bootstrap Fase 3 — se questa query restituisce righe, il
--      bootstrap è già stato eseguito, non ripeterlo)
-- ============================================================

-- 1) Enum
select typname, enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname = 'cms_role'
order by e.enumsortorder;

-- 2) Colonne admin_users
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'admin_users'
  and column_name in ('role', 'nome', 'attivo', 'creato_da')
order by column_name;

-- 3) Tabella audit
select table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'cms_audit_log';

-- 4) RLS attiva
select relname, relrowsecurity
from pg_class
where relname in ('admin_users', 'cms_audit_log');

-- 5) Policy create da questa migration
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and policyname in (
    'cms_admin_users_read_if_active_admin',
    'cms_admin_users_manage_if_super_admin',
    'cms_audit_log_read_if_active_admin',
    'cms_audit_log_write_if_active_admin'
  )
order by tablename, policyname;

-- 6) Nessun super_admin ancora presente (atteso PRIMA del bootstrap Fase 3)
select id, email, role, attivo from admin_users where role = 'super_admin';
