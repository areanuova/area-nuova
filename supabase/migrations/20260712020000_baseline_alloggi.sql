-- ============================================================
-- BASELINE DOCUMENTALE — alloggi
-- Sprint 2.1 (bozza) → Sprint 2.2 (corretta contro il remoto reale)
--
-- ⚠️  NON APPLICARE AUTOMATICAMENTE SENZA CONFRONTO CON IL REMOTO.
--     Anche se ogni colonna sotto è ora VERIFICATA (non più dedotta),
--     "verificato lo schema" non equivale a "sicuro da eseguire alla
--     cieca" — vedi nota in fondo al file.
--
-- Sprint 2.2 ha avuto accesso in sola lettura al progetto Supabase reale
-- tramite le credenziali già presenti in .env (PUBLIC_SUPABASE_URL,
-- SUPABASE_SERVICE_ROLE_KEY) — nessuna Supabase CLI collegata, nessuna
-- connessione diretta a Postgres: introspezione fatta leggendo il
-- documento OpenAPI generato da PostgREST (GET /rest/v1/ con la service
-- role key, che espone colonne/tipi/nullable/default) e osservando il
-- comportamento reale delle query in sola lettura. Metodo e output
-- completi in docs/SUPABASE_REMOTE_AUDIT.md.
-- ============================================================

-- ------------------------------------------------------------
-- SEZIONE 1 — Struttura, VERIFICATA contro lo schema remoto reale
-- (in precedenza dedotta dal solo codice applicativo nello Sprint 2.1)
-- ------------------------------------------------------------

create table if not exists public.alloggi (
  id                      uuid primary key default gen_random_uuid(), -- VERIFICATO (era dedotto)
  titolo                  text not null,                              -- VERIFICATO
  tipo                    text not null,                              -- VERIFICATO — 7 valori osservati lato UI, CHECK non confermato (vedi sotto)
  citta                   text not null,                              -- VERIFICATO
  zona                    text,                                       -- VERIFICATO — nullable
  prezzo                  integer not null,                           -- VERIFICATO
  spese_incluse           boolean not null default false,             -- VERIFICATO
  disponibile_da          date,                                       -- VERIFICATO — nullable
  descrizione             text not null,                              -- VERIFICATO
  foto_url                text,                                       -- VERIFICATO — nullable
  foto_urls               jsonb not null,                             -- VERIFICATO (tipo jsonb confermato dallo schema remoto; era "dedotto" nello Sprint 2.1)
  inserzionista_nome      text not null,                              -- VERIFICATO
  inserzionista_email     text not null,                              -- VERIFICATO
  inserzionista_telefono  text,                                       -- VERIFICATO — nullable
  stato                   text not null default 'in_attesa',          -- VERIFICATO — 4 valori osservati, CHECK non confermato (vedi sotto)
  scade_il                date,                                       -- VERIFICATO NULLABLE (CORRETTO: nello Sprint 2.1 era erroneamente "not null" —
                                                                       -- l'app la valorizza sempre in fase di insert, ma il database la ammette nulla.
                                                                       -- Se una futura via di inserimento la omettesse, la riga non comparirebbe mai
                                                                       -- nelle query pubbliche `.gte('scade_il', oggi)`, senza errore — nota per Sprint 3.)
  privacy_accettata       boolean not null default false,             -- VERIFICATO
  privacy_accettata_at    timestamptz,                                -- VERIFICATO — nullable
  termini_accettati       boolean not null default false,             -- VERIFICATO
  termini_accettati_at    timestamptz,                                -- VERIFICATO — nullable
  created_at              timestamptz not null default now(),         -- VERIFICATO
  updated_at              timestamptz not null default now()          -- NUOVO: colonna reale mai vista nel codice applicativo (nessuna query la
                                                                       -- legge o scrive esplicitamente) — mancava del tutto nella baseline Sprint 2.1.
                                                                       -- Verosimilmente aggiornata da un trigger non osservabile da REST (vedi §8
                                                                       -- SUPABASE_REMOTE_AUDIT.md: presenza di un trigger non confermabile né esclusa).
);

-- CHECK su tipo/stato: NON CONFERMATI. Il documento OpenAPI di PostgREST
-- (fonte di tutte le altre verifiche in questo file) non espone il testo
-- dei CHECK constraint, solo "type: string" — non distingue un CHECK da
-- una colonna text libera. Restano quindi proposti-non-verificati, non
-- "verificati" come il resto dello schema. Se già presenti con nomi
-- diversi, questo blocco è ridondante ma innocuo.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'alloggi_tipo_check' and conrelid = 'public.alloggi'::regclass
  ) then
    alter table public.alloggi add constraint alloggi_tipo_check
      check (tipo in ('stanza_singola','stanza_doppia','posto_letto','monolocale','bilocale','appartamento','altro'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'alloggi_stato_check' and conrelid = 'public.alloggi'::regclass
  ) then
    alter table public.alloggi add constraint alloggi_stato_check
      check (stato in ('in_attesa','pubblicato','rifiutato','scaduto'));
  end if;
end $$;

-- Indici: presenza reale NON verificabile via PostgREST (non espone
-- pg_indexes). Proposti sulla base delle query osservate, non confermati.
create index if not exists alloggi_stato_scade_il_idx on public.alloggi (stato, scade_il);
create index if not exists alloggi_created_at_idx on public.alloggi (created_at desc);

-- ------------------------------------------------------------
-- SEZIONE 2 — RLS: DEFINITIVAMENTE VERIFICATA (Sprint 2.3)
-- ------------------------------------------------------------
--
-- Sprint 2.3 ha letto direttamente pg_class.relrowsecurity e pg_policies
-- nel SQL Editor Supabase (query di sola lettura, nessuna scrittura).
-- CONFERMATO: RLS attiva (relrowsecurity = true, relforcerowsecurity =
-- false — normale, vedi nota in baseline_admin_users.sql). Le 4 policy
-- reali su questa tabella:
--
--   "Lettura pubblica annunci pubblicati"  SELECT  {anon,authenticated}
--     USING (stato = 'pubblicato')
--   "Admin: SELECT tutti gli annunci"      SELECT  {authenticated}
--     USING (is_admin())
--   "Insert anonima in attesa"             INSERT  {anon,authenticated}
--     WITH CHECK (stato = 'in_attesa' AND privacy_accettata = true
--                 AND termini_accettati = true)
--   "Admin: UPDATE stato e scade_il"       UPDATE  {authenticated}
--     USING (is_admin()) WITH CHECK (is_admin())
--
-- Tutti i rischi ipotizzati negli Sprint 2.1/2.2 su questa tabella sono
-- quindi ESCLUSI: la lettura pubblica è correttamente ristretta, l'INSERT
-- forza lo stato (ed è persino più severo del previsto, richiedendo anche
-- privacy/termini), l'UPDATE è riservato agli admin con USING e WITH
-- CHECK simmetrici. Il file `20260712040000_harden_alloggi_rls.sql`
-- (Sprint 2.2), che proponeva protezioni equivalenti sotto nomi diversi,
-- è stato rimosso nello Sprint 2.3 perché interamente ridondante — vedi
-- docs/SUPABASE_REMOTE_AUDIT.md per la cronologia completa.
alter table public.alloggi enable row level security;
