-- ============================================================
-- Sprint 5.0B — Completamento piattaforma amministrativa
-- NON APPLICATA AUTOMATICAMENTE — nessun canale di esecuzione DDL
-- disponibile in questa sessione (confermato: nessun DATABASE_URL, nessun
-- token Management API, nessun psql/pg — stesso limite già documentato
-- per la migration 20260712000000_cms_roles.sql). Eseguire manualmente
-- nel SQL Editor Supabase, come tutte le migration precedenti di questo
-- repository che introducono nuove tabelle o colonne.
--
-- Impatto limitato deliberatamente: la maggior parte delle funzionalità
-- dello Sprint 5.0B (impostazioni sito, versioning, pianificazione,
-- checklist editoriali) è stata progettata per restare git-backed
-- (content collection esistenti) o per riusare tabelle già presenti
-- (cms_audit_log), senza richiedere nuovo schema. Le uniche due aree che
-- necessitano davvero un nuovo datastore strutturato con stato
-- letto/non-letto e query per tipo/dimensione/data sono la media library
-- e le notifiche persistenti — entrambe sotto.
-- ============================================================

-- ------------------------------------------------------------
-- 1. cms_media (Fase 2 — Media library)
-- ------------------------------------------------------------
create table if not exists cms_media (
  id            uuid primary key default gen_random_uuid(),
  path          text not null unique,        -- percorso nel bucket Storage "cms-media"
  filename      text not null,                -- nome file normalizzato (mostrato in UI)
  mime_type     text not null,
  size_bytes    bigint not null,
  width         int,
  height        int,
  alt_text      text,
  caption       text,
  uploaded_by   uuid references admin_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table cms_media enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cms_media'
      and policyname = 'cms_media_read_if_active_admin'
  ) then
    create policy "cms_media_read_if_active_admin"
      on cms_media for select
      using (is_admin() and (select attivo from admin_users where email = auth.email()));
  end if;
end $$;

-- Nessuna policy INSERT/UPDATE/DELETE per authenticated: tutte le scritture
-- passano dalle route /api/admin/media/* con la service role key (stesso
-- pattern del resto del CMS — mai scrittura diretta lato client).

-- ------------------------------------------------------------
-- 2. cms_notifications (Fase 8 — Notifiche persistenti)
-- ------------------------------------------------------------
create table if not exists cms_notifications (
  id                  uuid primary key default gen_random_uuid(),
  destinatario_id     uuid references admin_users(id),   -- null se destinata a un ruolo intero
  destinatario_ruolo  cms_role,                           -- alternativa a destinatario_id
  tipo                text not null,
  priorita            text not null default 'normale',    -- bassa | normale | alta
  titolo              text not null,
  messaggio           text,
  link                text,
  letta               boolean not null default false,
  archiviata          boolean not null default false,
  created_at          timestamptz not null default now(),
  constraint cms_notifications_destinatario_check
    check (destinatario_id is not null or destinatario_ruolo is not null)
);

alter table cms_notifications enable row level security;

-- Ogni admin attivo legge solo le notifiche dirette a sé o al proprio ruolo.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cms_notifications'
      and policyname = 'cms_notifications_read_own'
  ) then
    create policy "cms_notifications_read_own"
      on cms_notifications for select
      using (
        is_admin()
        and (select attivo from admin_users where email = auth.email())
        and (
          destinatario_id = (select id from admin_users where email = auth.email())
          or destinatario_ruolo = (select role from admin_users where email = auth.email())
        )
      );
  end if;
end $$;

-- Un admin può marcare come letta/archiviata solo la propria notifica.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cms_notifications'
      and policyname = 'cms_notifications_update_own'
  ) then
    create policy "cms_notifications_update_own"
      on cms_notifications for update
      using (
        is_admin()
        and (select attivo from admin_users where email = auth.email())
        and (
          destinatario_id = (select id from admin_users where email = auth.email())
          or destinatario_ruolo = (select role from admin_users where email = auth.email())
        )
      );
  end if;
end $$;

-- Nessuna policy INSERT per authenticated: le notifiche sono create solo
-- dalle route server con la service role key, mai dal client.

-- ------------------------------------------------------------
-- 3. admin_users — colonne per gestione avanzata utenti (Fase 10)
-- ------------------------------------------------------------
alter table admin_users
  add column if not exists sospeso boolean not null default false,
  add column if not exists sospeso_motivo text,
  add column if not exists sospeso_il timestamptz,
  add column if not exists ultima_attivita timestamptz,
  add column if not exists invitato_il timestamptz,
  add column if not exists note_interne text,
  add column if not exists permessi_extra jsonb not null default '{}';

-- permessi_extra: capacità opzionali aggiuntive rispetto al ruolo base
-- (es. {"media.manage": true}), MAI un secondo sistema di ruoli — il
-- controllo lato server resta sempre "ruolo minimo richiesto OR
-- permessi_extra->>'chiave' = 'true'", mai l'inverso.

-- ============================================================
-- VERIFICA (sola lettura) — eseguire subito dopo per confermare
-- ============================================================

select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('cms_media', 'cms_notifications');

select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'admin_users'
  and column_name in ('sospeso','sospeso_motivo','sospeso_il','ultima_attivita','invitato_il','note_interne','permessi_extra')
order by column_name;

select relname, relrowsecurity from pg_class
where relname in ('cms_media', 'cms_notifications');

select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('cms_media', 'cms_notifications')
order by tablename, policyname;
