# Fondamenta amministrative — Area Nuova (Sprint 2.1 → 2.4)

Documento di consolidamento. Descrive lo stato dei tre sistemi
amministrativi del sito al 2026-07-12, cosa è stato corretto negli Sprint
2.1–2.4, e il percorso consigliato verso il CMS unificato descritto in
`docs/CMS_ARCHITECTURE.md`.

Nello Sprint 2.4 è stata applicata, con autorizzazione esplicita e ambito
limitato, l'unica modifica remota di questa intera catena di sprint: i
limiti del bucket Storage `alloggi-foto` (§6, §13). Nessun'altra migration
è stata applicata al database remoto. Nessun deploy è stato eseguito.
Ogni affermazione è etichettata:

- **verificato definitivamente** — confermato nello Sprint 2.3 leggendo
  direttamente `pg_policies`, `pg_class`, `pg_proc` nel SQL Editor Supabase
  (query di sola lettura, eseguite dall'utente su nostra richiesta — non
  raggiungibili con le sole API REST usate negli sprint precedenti);
- **verificato sul remoto** — confermato negli Sprint 2.2/2.3 via
  introspezione PostgREST/Storage o test comportamentali;
- **dedotto** — inferenza ragionevole dal codice applicativo, non
  confermata contro il remoto;
- **sconosciuto** — non verificabile con i mezzi disponibili (richiederebbe
  un'operazione di scrittura, esplicitamente vietata in tutti e tre gli
  sprint, o un accesso non disponibile).

Lo Sprint 2.3 chiude tutte le voci RLS che negli Sprint 2.1/2.2 erano
etichettate "sconosciuto" o "non escludibile senza scrittura": l'utente ha
eseguito nel proprio SQL Editor le query di sola lettura preparate nello
Sprint 2.2, restituendo il testo esatto delle policy reali e della
definizione di `is_admin()`. Nessuna di queste query è stata eseguita da
Claude — solo predisposta; l'esecuzione e la lettura dei risultati sono
avvenute per mano dell'utente nella dashboard Supabase.

---

## 1–2. Sistemi amministrativi esistenti e loro scopo

| Sistema | Scopo | Percorso |
|---|---|---|
| **Decap CMS** | Editing di 8 delle 11 Content Collection editoriali tramite un'interfaccia web che committa direttamente sul repository GitHub | `/admin` (statico, `public/admin/`) |
| **`/admin/alloggi`** | Moderazione degli annunci di alloggi inviati dagli studenti | `/admin/alloggi` |
| **`/admin/aris`** | Consultazione delle statistiche di feedback (👍/👎) del widget Aris | `/admin/aris` |

I tre sistemi non condividono codice di autenticazione, sessione o
autorizzazione.

## 3. Modalità di autenticazione

| Sistema | Login | Identità individuale | Revoca per singola persona |
|---|---|---|---|
| Decap CMS | OAuth GitHub (scope `repo,user`) | Sì — account GitHub | Sì |
| `/admin/alloggi` | Supabase Auth, magic link | Sì — indirizzo email | Sì (riga in `admin_users`) |
| `/admin/aris` | Segreto condiviso (`ARIS_ADMIN_SECRET`) | **No** | **No** |

## 4. Dipendenze esterne

- **Decap CMS**: GitHub, CDN jsDelivr.
- **`/admin/alloggi`**: Supabase Auth + Postgres (`admin_users`, `alloggi`) + Supabase Storage (`alloggi-foto`) + `public.is_admin()` — **verificata definitivamente** nello Sprint 2.3, vedi §6.
- **`/admin/aris`**: Supabase Postgres (`aris_feedback`).

## 5. Variabili ambiente

Vedi `.env.example`. Invariato dallo Sprint 2.1.

## 6. Schema Supabase coinvolto

Tabelle: `admin_users`, `alloggi`. Bucket Storage: `alloggi-foto`. Migration:

- `supabase/migrations/20260712010000_baseline_admin_users.sql`
- `supabase/migrations/20260712020000_baseline_alloggi.sql`
- `supabase/migrations/20260712030000_baseline_alloggi_storage.sql`
- `supabase/migrations/20260712050000_harden_alloggi_storage_limits.sql` (unico gap reale rimasto, non applicata)
- `supabase/migrations/20260712060000_harden_is_admin_privileges.sql` (hardening P3 opzionale, non applicata)

**Nessuno di questi file è stato eseguito.** Il file
`20260712040000_harden_alloggi_rls.sql` (Sprint 2.2) è stato **rimosso**
nello Sprint 2.3: le due policy che proponeva esistono già sul remoto,
sotto nomi diversi, con logica equivalente o più severa — vedi §7.

### admin_users — colonne

| Colonna | Tipo | Nullable | Default | Stato |
|---|---|---|---|---|
| `id` | uuid | no (pk) | `gen_random_uuid()` | verificato sul remoto |
| `email` | text | no | — | verificato sul remoto |
| `created_at` | timestamptz | sì | `now()` | verificato sul remoto |

Nessuna colonna `role`, `nome`, `attivo`. Nessuna foreign key verso
`auth.users` — l'associazione admin↔sessione avviene per confronto
testuale dell'email (`auth.email()`), non per chiave esterna.

### `public.is_admin()` — VERIFICATA DEFINITIVAMENTE (Sprint 2.3)

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

- **Proprietario**: `postgres`.
- **`SECURITY DEFINER` con `search_path` esplicitamente fissato a
  `'public'`** — questa è la configurazione corretta e attesa. Una
  funzione `SECURITY DEFINER` con `search_path` non fissato è un vettore
  di privilege escalation noto in Postgres (un chiamante potrebbe
  manipolare il proprio `search_path` di sessione per far risolvere
  riferimenti non qualificati nel corpo della funzione verso oggetti
  diversi da quelli previsti). Qui il rischio non si applica: il
  `search_path` è fissato esplicitamente e non dipende dal chiamante.
  **Nessuna vulnerabilità.**
- **Logica**: verifica semplicemente se esiste una riga in `admin_users`
  con `email` uguale a quella dell'utente autenticato corrente
  (`auth.email()`). `SECURITY DEFINER` è necessario proprio per questo:
  permette alla funzione di leggere `admin_users` con i privilegi del
  proprietario (bypassando la RLS della tabella, che altrimenti
  limiterebbe la lettura alla sola riga dell'utente stesso — vedi §7),
  così da poter verificare correttamente l'appartenenza.
- **Privilegi di esecuzione attuali**: `PUBLIC`, `postgres`, `anon`,
  `authenticated`, `service_role` hanno tutti `EXECUTE`. Nessuna policy
  reale che si applica al ruolo `anon` richiama `is_admin()` (vedi §7) —
  l'esecuzione da parte di `anon` è quindi superflua ma non pericolosa
  (la funzione ritorna semplicemente `false` per chi non è autenticato,
  verificato). Hardening difensivo P3 proposto, non applicato:
  `harden_is_admin_privileges.sql`.

### `20260712000000_cms_roles.sql` (Sprint 2.0) — CORRETTA nello Sprint 3

*(Correzione di questa nota: in un primo momento era stata attribuita
allo Sprint 2.3 — la correzione del file è stata effettivamente
applicata nello Sprint 3, contestualmente all'implementazione del
pannello CMS pilota, non prima.)*

Le 3 incompatibilità individuate nello Sprint 2.2 sono state risolte
direttamente nel file: pattern `DROP POLICY` sostituito con
`DO $$ ... IF NOT EXISTS $$`; la clausola ridondante su `created_at`
rimossa; le nuove policy proposte ora richiamano `is_admin()` invece di
duplicarne la logica. Resta **non applicata sul remoto** (nessun canale
DDL disponibile, vedi `docs/CMS_SPRINT_3.md`) — è tuttora la migration
che introdurrebbe i ruoli CMS reali.

### alloggi — colonne

| Colonna | Tipo | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no (pk) | `gen_random_uuid()` |
| `titolo` | text | no | — |
| `tipo` | text | no | — |
| `citta` | text | no | — |
| `zona` | text | sì | — |
| `prezzo` | integer | no | — |
| `spese_incluse` | boolean | no | `false` |
| `disponibile_da` | date | sì | — |
| `descrizione` | text | no | — |
| `foto_url` | text | sì | — |
| `foto_urls` | jsonb | no | — |
| `inserzionista_nome` | text | no | — |
| `inserzionista_email` | text | no | — |
| `inserzionista_telefono` | text | sì | — |
| `stato` | text | no | `'in_attesa'` |
| `scade_il` | date | sì | — |
| `privacy_accettata` | boolean | no | `false` |
| `privacy_accettata_at` | timestamptz | sì | — |
| `termini_accettati` | boolean | no | `false` |
| `termini_accettati_at` | timestamptz | sì | — |
| `created_at` | timestamptz | no | `now()` |
| `updated_at` | timestamptz | no | `now()` |

Tutte verificate sul remoto (Sprint 2.2). CHECK constraint su `tipo`/`stato`
e presenza di indici/trigger restano non verificabili con i metodi usati
(né PostgREST né le query pg_policies li espongono) — non bloccante: le
policy RLS (vincolo di sicurezza reale) sono verificate indipendentemente
da eventuali CHECK, vedi §7.

### Bucket `alloggi-foto`

| Proprietà | Valore |
|---|---|
| `public` | `true` |
| `file_size_limit` | `5242880` (5 MB) — **applicato Sprint 2.4**, era `null` |
| `allowed_mime_types` | `{image/jpeg,image/png,image/webp}` — **applicato Sprint 2.4**, era `null` |
| Bucket totali nel progetto | 1 |
| Enumerabilità da `anon` | bloccata |

## 7. Stato RLS — DEFINITIVAMENTE VERIFICATO (Sprint 2.3)

RLS attiva su tutte e tre le superfici (`pg_class.relrowsecurity = true`
per `public.alloggi`, `public.admin_users`, `storage.objects`).
`relforcerowsecurity = false` su tutte e tre — **normale e atteso**: forza
RLS anche per il proprietario/superuser della tabella, cosa irrilevante
per questa applicazione, che non si connette mai come proprietario. I
ruoli usati dall'app (`anon`, `authenticated` — soggetti a RLS per design
— o `service_role` — bypassa RLS per contratto Supabase indipendentemente
da questo flag) non sono mai proprietari delle tabelle.

### Policy reali (testo esatto)

| Tabella | Nome policy | Comando | Ruoli | USING | WITH CHECK |
|---|---|---|---|---|---|
| `alloggi` | Lettura pubblica annunci pubblicati | SELECT | anon, authenticated | `stato = 'pubblicato'` | — |
| `alloggi` | Admin: SELECT tutti gli annunci | SELECT | authenticated | `is_admin()` | — |
| `alloggi` | Insert anonima in attesa | INSERT | anon, authenticated | — | `stato = 'in_attesa' AND privacy_accettata = true AND termini_accettati = true` |
| `alloggi` | Admin: UPDATE stato e scade_il | UPDATE | authenticated | `is_admin()` | `is_admin()` |
| `admin_users` | Admin: SELECT proprio record | SELECT | authenticated | `email = auth.email()` | — |
| `storage.objects` | Upload anonimo in pending | INSERT | anon, authenticated | — | `bucket_id = 'alloggi-foto' AND (storage.foldername(name))[1] = 'pending'` |

Nessuna policy DELETE su nessuna delle tre tabelle — coerente con il
codice applicativo, che non esegue mai una DELETE. Nessuna policy UPDATE
su `admin_users` o su `storage.objects` — coerente con l'assenza di
qualunque percorso applicativo che le richieda.

### Tutti i rischi RLS ipotizzati negli Sprint 2.1/2.2 sono ESCLUSI

1. ~~Lettura pubblica di annunci non pubblicati~~ — **ESCLUSO**. Policy
   `Lettura pubblica annunci pubblicati` conferma il filtro lato database.
2. ~~Bypass moderazione via INSERT diretto~~ — **ESCLUSO**. Policy
   `Insert anonima in attesa` forza `stato='in_attesa'` **e** richiede
   `privacy_accettata`/`termini_accettati` — più severa di quanto
   proposto negli sprint precedenti.
3. ~~`admin_users` leggibile da autenticato non-admin~~ — **ESCLUSO**.
   Policy `Admin: SELECT proprio record` limita ogni utente autenticato
   alla propria riga (`email = auth.email()`), non all'intera tabella.
4. ~~UPDATE su `alloggi` non riservato agli admin~~ — **ESCLUSO**. Policy
   `Admin: UPDATE stato e scade_il` ha `USING` e `WITH CHECK` entrambi
   `is_admin()`, simmetrici.
5. ~~Upload Storage non vincolato a `pending/`~~ — **ESCLUSO**. Policy
   `Upload anonimo in pending` vincola esplicitamente il path.

**Unico rischio RLS/Storage ancora reale**: assenza di limiti
dimensione/MIME lato bucket (non è una questione di policy RLS, è
configurazione del bucket — vedi §6 e §13).

## 8. Flussi editoriali

Invariato: Decap senza revisione; `/admin/alloggi` con coda di moderazione
a un livello; `/admin/aris` di sola lettura; modifica/segnalazione annunci
via email manuale.

## 9. Limiti noti

- Decap: nessun concetto di bozza/revisione; copre 8 collection su 11.
- `/admin/alloggi`: un solo indirizzo email ammesso lato frontend; nessuna
  UI per aggiungere admin; nessun limite dimensione/MIME lato Storage
  (correzione pronta, non applicata); foto orfane mai ripulite (file da 0
  byte osservati); MIME verificato solo per valore dichiarato dal client,
  non per firma reale dei byte — limitazione residua, richiederebbe nuova
  logica applicativa, valutata fuori da un hardening minimo.
- `/admin/aris`: nessuna identità individuale.
- Nessun audit log su nessuno dei tre sistemi.

## 10. Stato di Decap CMS

Invariato dallo Sprint 2.1: OAuth corretto (`src/pages/api/auth.ts`/`callback.ts`,
CSRF `state` aggiunto). Non verificato end-to-end su deploy reale.

## 11. Stato di `/admin/alloggi`

Funzionante. Autenticazione e autorizzazione **ora interamente verificate
in modo definitivo** (§7) — non più assunzioni né deduzioni. Sistema
meglio posizionato per la base del pannello unificato.

## 12. Stato di `/admin/aris`

Invariato. Bug fail-open corretto nello Sprint 2.1.

## 13. Rischi ancora aperti

| # | Rischio | Priorità | Stato |
|---|---|---|---|
| 1 | Migration/schema mai versionati prima dello Sprint 2.1 | P1 | **Risolto** |
| 2 | Lettura pubblica annunci non pubblicati | P1 | **Escluso definitivamente** |
| 3 | Bypass moderazione via INSERT diretto | P1 | **Escluso definitivamente** |
| 4 | `/api/index-content` fail-open | P1 | **Corretto** (Sprint 2.1) |
| 5 | Decap OAuth 404 in produzione | P1 | **Corretto** (Sprint 2.1), non verificato end-to-end |
| 6 | OAuth GitHub senza `state` | P2 | **Corretto** (Sprint 2.1) |
| 7 | `admin_users` leggibile da autenticato non-admin | P2 | **Escluso definitivamente** |
| 8 | Nessun limite dimensione/MIME sul bucket `alloggi-foto` | P1 | **Risolto (Sprint 2.4)** — applicato via Storage Admin API, verificato: 5MB + jpeg/png/webp attivi, 16/16 file esistenti invariati |
| 9 | Tre segreti Aris con scopi sovrapposti | P2 | Mitigato — documentati |
| 10 | Nessun audit log | P2 | Aperto — previsto nella migration CMS, non eseguita |
| 11 | Foto orfane mai ripulite | P3 | Aperto |
| 12 | Decap non copre 3 collection nuove | P3 | Aperto |
| 13 | `cms_roles.sql` incompatibilità | P2 | **Risolto** (Sprint 3, non Sprint 2.3 come indicato in una nota precedente) |
| 14 | `is_admin()` eseguibile da `PUBLIC`/`anon` senza necessità | P3 | Aperto — hardening difensivo proposto, non vulnerabilità |

Nessun rischio P0 né P1 aperto (Sprint 2.4: applicato l'ultimo P1 — limiti
bucket Storage). Tutti i rischi RLS ipotizzati sono stati esclusi con
evidenza diretta e definitiva. Restano solo rilievi P2/P3 non bloccanti
(righe 9-12, 14).

## 14. Stato delle migration

- **Applicata (Sprint 2.4)**: `harden_alloggi_storage_limits.sql`, via
  Storage Admin API (non tramite esecuzione diretta del file — vedi
  intestazione del file per il metodo).
- **Non applicate, non necessarie con urgenza**: le migration baseline
  (§6) rappresentano fedelmente lo stato reale ma non richiedono
  esecuzione per la sicurezza dell'app (RLS già corretta indipendentemente
  da esse). `harden_is_admin_privileges.sql` resta P3 opzionale.
- **Non applicata, per lo Sprint 3**: `20260712000000_cms_roles.sql`.

## 15. Percorso consigliato verso il CMS unificato

Invariato rispetto a `docs/CMS_ARCHITECTURE.md` §4. Con l'hardening dello
Storage applicato (Sprint 2.4), non resta alcun prerequisito tecnico
bloccante prima dell'avvio dello Sprint 3 CMS.

---

*Un'unica modifica remota è stata applicata in questa catena di sprint
(Sprint 2.4, limiti bucket Storage, autorizzazione esplicita e ambito
limitato). Nessun'altra migration è stata eseguita. Nessun file è stato
committato, pushato o deployato.*
