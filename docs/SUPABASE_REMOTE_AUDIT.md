# Audit Supabase remoto — Area Nuova (Sprint 2.2 → 2.4)

Verbale dell'introspezione in sola lettura del progetto Supabase reale
(Sprint 2.2-2.3) e dell'unica scrittura remota eseguita in questa catena
di sprint (Sprint 2.4, limiti bucket Storage, autorizzazione esplicita e
ambito limitato). Nessun'altra scrittura, migration o deploy eseguiti.

## 1. Data dell'audit

2026-07-12 (Sprint 2.2), completato 2026-07-12 (Sprint 2.3), hardening
Storage applicato 2026-07-12 (Sprint 2.4).

## 2. Metodo usato

**Sprint 2.2** — introspezione via chiamate HTTP dirette alle API ufficiali
Supabase (PostgREST OpenAPI, Storage API), in sola lettura, con le
credenziali già presenti in `.env` locale. Nessuna Supabase CLI collegata,
nessuna connessione diretta a Postgres. Dettaglio completo dei metodi in
cronologia più sotto (§2.2).

**Sprint 2.3** — le API REST usate nello Sprint 2.2 non espongono il testo
delle policy RLS né il corpo delle funzioni SQL. Per colmare questo, sono
state preparate due query di sola lettura contro i cataloghi di sistema
Postgres (`pg_policies`, `pg_class`, `pg_proc`, `information_schema`),
consegnate all'utente per l'esecuzione manuale nel SQL Editor Supabase
(che si connette con privilegi sufficienti a leggere i cataloghi, a
differenza delle chiavi API REST). **Claude non ha eseguito queste query
direttamente** — le ha scritte, l'utente le ha eseguite ed ha riportato i
risultati in chat, poi trascritti qui. Nessuna delle due query conteneva
`INSERT`/`UPDATE`/`DELETE`/`ALTER`/`CREATE`/`DROP`/`GRANT`/`REVOKE`, solo
`SELECT` contro cataloghi di sistema.

### 2.2 — Dettaglio chiamate Sprint 2.2

1. `GET /rest/v1/` con service role key → OpenAPI 2.0 PostgREST completo.
2. `GET /rest/v1/rpc/is_admin` — funzione STABLE, senza argomenti.
3. `GET /rest/v1/alloggi?select=id,stato` e `admin_users?select=id`, anon
   vs service role — mai selezionate colonne con PII.
4. `GET /storage/v1/bucket/alloggi-foto` e `GET /storage/v1/bucket`.
5. `POST /storage/v1/object/list/alloggi-foto` (list/enumerazione, non
   scrittura), anon vs service role.

Operazioni deliberatamente NON eseguite in nessuno dei due sprint: nessun
INSERT/UPDATE/DELETE reale, nemmeno con `Prefer: tx=rollback` (PostgREST) —
scartato perché esegue comunque una query di scrittura reale contro il
database di produzione.

## 3. Ambienti verificati

Un solo ambiente, quello puntato da `PUBLIC_SUPABASE_URL` in `.env` locale.

## 4. Tabelle

Invariato dallo Sprint 2.2: `admin_users`, `alloggi` nello schema `public`
(oggetto di questo audit), più le tabelle `aris_*` (fuori ambito, non
riaudite), `storage.objects`/`storage.buckets`.

## 5. Colonne

Vedi `docs/ADMIN_FOUNDATIONS.md` §6 — tabelle complete, invariate dallo
Sprint 2.2 (nessuna nuova colonna emersa nello Sprint 2.3).

## 6. Indici

Ancora non verificabili con i metodi usati in questo repository (né REST
né le query `pg_policies`/`pg_proc` preparate espongono `pg_indexes`).

## 7. Constraint

Invariato dallo Sprint 2.2: PK e default verificati; CHECK su
`tipo`/`stato` e UNIQUE su `admin_users.email` non verificabili con i
metodi usati (le query di sistema preparate in questo sprint erano mirate
a policy e funzioni, non a `pg_constraint` — estendibile in un audit
futuro se necessario).

## 8. Trigger

Ancora non verificabile. La presenza di `alloggi.updated_at` con default
`now()` suggerisce, senza confermarlo, un trigger `BEFORE UPDATE`.

## 9. Funzioni

### `public.is_admin()` — DEFINIZIONE COMPLETA VERIFICATA (Sprint 2.3)

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE email = auth.email()
  );
$function$;
```

Proprietario: `postgres`. Privilegi EXECUTE attuali: `PUBLIC`, `postgres`,
`anon`, `authenticated`, `service_role`.

**Valutazione di sicurezza**: `SECURITY DEFINER` con `search_path`
esplicitamente fissato a `'public'` — la combinazione corretta. Il rischio
noto associato a `SECURITY DEFINER` (privilege escalation tramite
manipolazione del `search_path` del chiamante per dirottare riferimenti
non qualificati nel corpo della funzione) **non si applica**: il
`search_path` è fissato dalla funzione stessa, indipendente dal
chiamante. Il corpo è una singola query `EXISTS` di sola lettura contro
`admin_users` — nessuna logica nascosta, nessun side effect, nessun
riferimento non qualificato che potrebbe risolvere altrove. **Nessuna
vulnerabilità identificata in questa funzione.**

`public.aris_search(...)` — non riaudita (fuori ambito). Nessuna funzione
di esecuzione SQL generica esposta via RPC (confermato Sprint 2.2).

## 10. RLS — DEFINITIVAMENTE VERIFICATO (Sprint 2.3)

### Stato RLS per tabella (letto da `pg_class`)

| Schema | Tabella | `relrowsecurity` | `relforcerowsecurity` |
|---|---|---|---|
| public | admin_users | true | false |
| public | alloggi | true | false |
| storage | objects | true | false |

`relforcerowsecurity = false` su tutte e tre è **normale e atteso**: forza
RLS anche per il proprietario della tabella — irrilevante qui, perché
l'applicazione non si connette mai come proprietario (`postgres`), solo
come `anon`/`authenticated` (sempre soggetti a RLS) o `service_role`
(bypassa RLS per contratto Supabase, non per questo flag).

### Policy reali (lette da `pg_policies`, testo esatto di USING/WITH CHECK)

| Tabella | Policy | Comando | Modalità | Ruoli | USING | WITH CHECK | Richiama `is_admin()` |
|---|---|---|---|---|---|---|---|
| admin_users | Admin: SELECT proprio record | SELECT | PERMISSIVE | authenticated | `email = auth.email()` | — | no |
| alloggi | Insert anonima in attesa | INSERT | PERMISSIVE | anon, authenticated | — | `stato = 'in_attesa' AND privacy_accettata = true AND termini_accettati = true` | no |
| alloggi | Admin: SELECT tutti gli annunci | SELECT | PERMISSIVE | authenticated | `is_admin()` | — | **sì** |
| alloggi | Lettura pubblica annunci pubblicati | SELECT | PERMISSIVE | anon, authenticated | `stato = 'pubblicato'` | — | no |
| alloggi | Admin: UPDATE stato e scade_il | UPDATE | PERMISSIVE | authenticated | `is_admin()` | `is_admin()` | **sì** |
| storage.objects | Upload anonimo in pending | INSERT | PERMISSIVE | anon, authenticated | — | `bucket_id = 'alloggi-foto' AND (storage.foldername(name))[1] = 'pending'` | no |

6 policy totali, tutte PERMISSIVE (nessuna RESTRICTIVE — quindi nessun
rischio di combinazione AND inaspettata tra policy permissive/restrittive:
le PERMISSIVE si combinano tra loro con OR, comportamento semplice e
prevedibile).

### Valutazione complessiva RLS

Tutti i rischi ipotizzati negli Sprint 2.1/2.2 sono **esclusi**:

- Lettura pubblica ristretta a `stato='pubblicato'` — confermato dal testo
  della policy, non solo dal comportamento osservato.
- INSERT anonimo forza `stato='in_attesa'` **e** richiede
  `privacy_accettata`/`termini_accettati` — più severo del previsto.
- UPDATE riservato ad admin, simmetrico (`USING`/`WITH CHECK` entrambi
  `is_admin()`).
- `admin_users` leggibile solo per la propria riga da un autenticato,
  mai l'intera tabella.
- Upload Storage vincolato al prefisso `pending/`.

Nessuna policy RESTRICTIVE nascosta che potrebbe intersecare
inaspettatamente le PERMISSIVE sopra (verificato: tutte PERMISSIVE).

## 11. Storage

Bucket `alloggi-foto`, unico bucket, `public: true` (invariato). **Sprint
2.4**: `file_size_limit` e `allowed_mime_types`, entrambi `null` dallo
Sprint 2.1 fino allo Sprint 2.3, sono stati impostati rispettivamente a
`5242880` (5 MB) e `{image/jpeg,image/png,image/webp}`, applicati via
Storage Admin API (`PUT /storage/v1/bucket/alloggi-foto`) con
autorizzazione esplicita dell'utente limitata a questa sola modifica.
Verificato dopo l'applicazione: 16/16 file preesistenti in `pending/`
invariati (stessi nomi, confrontati prima/dopo), un solo bucket nel
progetto (nessun altro creato o toccato).

## 12. Differenze rispetto alle migration

Tutte risolte nello Sprint 2.2 (schema) e 2.3 (RLS/funzioni). Le migration
baseline ora rappresentano fedelmente lo stato reale verificato. Vedi
`docs/ADMIN_FOUNDATIONS.md` §6 per il dettaglio file-per-file delle
correzioni Sprint 2.3 (rimozione `harden_alloggi_rls.sql`, correzione
`cms_roles.sql`, neutralizzazione di due policy proposte ora confermate
ridondanti in `baseline_admin_users.sql` e `baseline_alloggi_storage.sql`).

## 13. Rischi

Vedi `docs/ADMIN_FOUNDATIONS.md` §13 per la tabella completa. **Nessun
rischio P0 o P1 resta aperto** dopo lo Sprint 2.4: i rischi RLS erano già
stati esclusi nello Sprint 2.3, e l'unico rischio reale rimasto — limiti
mancanti sul bucket Storage — è stato risolto applicando la migration
corrispondente.

## 14. Correzioni proposte / applicate

- `supabase/migrations/20260712050000_harden_alloggi_storage_limits.sql` —
  **applicata (Sprint 2.4)** via Storage Admin API.
- `supabase/migrations/20260712060000_harden_is_admin_privileges.sql` —
  hardening difensivo P3 opzionale (non vulnerabilità), non applicata.
- `supabase/migrations/20260712040000_harden_alloggi_rls.sql` — **rimossa**
  nello Sprint 2.3, interamente superata dalle policy reali confermate.

## 15. Checklist prima dell'applicazione

1. ~~Applicare `harden_alloggi_storage_limits.sql`~~ — **fatto (Sprint 2.4)**.
2. Valutare (non obbligatorio) `harden_is_admin_privileges.sql`.
3. Le migration baseline sono verificate e sicure da eseguire — restano
   comunque da confrontare un'ultima volta con lo stato reale
   immediatamente prima dell'esecuzione, come buona norma per qualunque
   modifica a un database di produzione.

## 16. Piano di rollback

- `harden_alloggi_storage_limits.sql`: rollback incluso nel file
  (`update storage.buckets set file_size_limit = null, allowed_mime_types
  = null where id = 'alloggi-foto';`).
- `harden_is_admin_privileges.sql`: rollback incluso nel file
  (`grant execute on function public.is_admin() to public;`).
- Le migration baseline (`create table if not exists`, colonne con
  `add column if not exists`) non necessitano di un rollback distruttivo:
  non modificano né cancellano nulla che esista già.
- Raccomandato uno snapshot Supabase prima di qualunque applicazione,
  come precauzione standard indipendente dalla natura non distruttiva
  attesa delle migration.

## 17. Test da eseguire dopo un'eventuale applicazione

| # | Test | Esito atteso |
|---|---|---|
| 1 | Lettura pubblica annunci pubblicati (`/alloggi`) | Invariato |
| 2 | Upload foto JPEG/PNG/WEBP < 5MB | Riesce, come oggi |
| 3 | Upload foto > 5MB | **Nuovo**: rifiutato dal server (prima passava se il client veniva bypassato) |
| 4 | Upload file con MIME non consentito | **Nuovo**: rifiutato dal server |
| 5 | Login admin, moderazione annunci | Invariato |
| 6 | Se applicato harden is_admin: login admin ancora funzionante | Invariato (authenticated mantiene EXECUTE) |
| 7 | Se applicato harden is_admin: `GET /rpc/is_admin` con anon key | Cambia da `false` (200) a errore di permesso (403) — verificare che nulla vi si affidi |
