# CMS Sprint 3 — Pannello unificato, modulo pilota Partnership

Prima implementazione concreta del pannello CMS descritto in
`docs/CMS_ARCHITECTURE.md`. Un solo modulo di contenuto (Partnership) è
stato collegato end-to-end, per validare l'architettura prima di estenderla
alle altre collection. Nessuna migration applicata al database remoto in
questo sprint. Nessun commit, push o deploy.

---

## 1. Architettura reale implementata

Coerente con il modello "preferito" indicato nel mandato e già descritto in
`CMS_ARCHITECTURE.md` §2: contenuti editoriali versionati su Git, scrittura
GitHub esclusivamente server-side, Supabase per autenticazione/ruoli/audit,
un solo pannello admin. Nessuno scostamento architetturale — un solo
adattamento pratico, dovuto a un limite tecnico e non a una scelta:

**Modalità compatibilità ruoli.** La migration che introduce la colonna
`role` su `admin_users` (`20260712000000_cms_roles.sql`) non è applicabile
in questo ambiente: nessuna Supabase CLI collegata (`supabase/config.toml`
assente), nessun `SUPABASE_ACCESS_TOKEN`, nessuna connessione Postgres
diretta. Le uniche vie disponibili sono le API REST (PostgREST, Storage
Admin), che non possono eseguire `CREATE TYPE`/`ALTER TABLE`/`CREATE
POLICY`. Verificato di nuovo a inizio sprint (`npx supabase projects list`
→ `LegacyPlatformAuthRequiredError`). Di conseguenza ogni riga di
`admin_users` è trattata a runtime come ruolo `admin` (non `super_admin`,
per non concedere implicitamente la gestione utenti a chiunque sia
nell'allow-list attuale) — mai simulando un ruolo che il database non può
confermare. Il codice è scritto per passare automaticamente ai ruoli reali
non appena la migration sarà applicabile, senza modifiche (vedi §14).

---

## 2. Flusso di autenticazione

Stesso meccanismo già in uso in `/admin/alloggi` (Supabase Auth, magic
link) — nessun nuovo sistema di login introdotto, nessuna sessione
server-side via cookie (il progetto non ne ha mai avute).

- **Pagine `/admin/*`**: gate client-side (`AdminLayout.astro`). Al mount,
  verifica la sessione Supabase, poi legge `admin_users` (via RLS, chiave
  anon — un utente vede solo la propria riga) per determinare ruolo e
  `attivo`. Mostra login / non-autorizzato / errore / contenuto a seconda
  del risultato.
- **Route `/api/admin/*`**: rilette in modo **indipendente e server-side**.
  Il client invia il proprio access token come header `Authorization:
  Bearer <token>`; `requireAdminUser()` (`src/lib/admin/auth-server.ts`)
  lo verifica chiamando `supabase.auth.getUser(token)` (convalida reale
  contro il server Auth, non falsificabile) e rilegge `admin_users` con la
  service role (bypassa RLS, lettura affidabile). **Il gate client-side
  non è mai l'unico controllo per un'operazione che scrive dati** — ogni
  endpoint di scrittura riverifica tutto da zero.

**Perché due file separati (`auth-client.ts` / `auth-server.ts`) invece di
uno solo**: il primo tentativo univa le due funzioni in un solo modulo.
Verificando il bundle client generato dalla build, il rischio non era
teorico: `requireAdminUser` importa `getAdminSupabase()` (chiave
service-role) — tenerle nello stesso file avrebbe reso la sicurezza
dipendente dal tree-shaking del bundler, non dalla struttura del codice.
Separati in due moduli, `auth-client.ts` non ha alcun percorso di import
verso la service role: è strutturalmente impossibile che finisca nel
bundle browser. **Verificato** cercando `SUPABASE_SERVICE_ROLE_KEY`,
`getAdminSupabase`, `requireAdminUser`, `commitContentFile` nell'intero
output statico dopo la build — nessuna occorrenza.

---

## 3. Matrice ruoli

Centralizzata in `src/lib/admin/roles.ts` — nessun controllo sparso nelle
pagine.

| Permesso | super_admin | admin | editor |
|---|:---:|:---:|:---:|
| `users.manage` (gestione utenti) | ✅ | ❌ | ❌ |
| `content.publish` / `content.manage` | ✅ | ✅ | ❌ |
| `content.edit` (crea/modifica non pubblicato) | ✅ | ✅ | ✅ |
| `audit.view` | ✅ | ✅ | ❌ |

**Transizioni di stato ammesse** (`canTransition`):

| Da → A | draft | review | published | archived |
|---|:---:|:---:|:---:|:---:|
| **editor**, da draft | ✅ | ✅ | ❌ | ❌ |
| **editor**, da review | ✅ | ✅ | ❌ | ❌ |
| **admin/super_admin**, da qualunque stato | ✅ | ✅ | ✅ | ✅ (regole complete in `roles.ts`) |

Nessuna cancellazione reale implementata: "archiviato" è lo stato
terminale che sostituisce la DELETE per contenuto versionato su Git —
coerente con l'architettura approvata, che non prevede un flusso di
cancellazione distruttiva per file in un repository.

---

## 4. Flusso editoriale Partnership

1. **Elenco** (`/admin/partnership`) — legge `/api/admin/partnership/list`
   (server-side, `getCollection('partnership')`), con ricerca per nome e
   filtro per stato lato client.
2. **Creazione** (`/admin/partnership/nuova`) — form con slug
   auto-proposto dal nome (modificabile finché non toccato manualmente).
3. **Modifica** (`/admin/partnership/[slug]`, SSR) — precarica i dati
   esistenti dallo stesso endpoint `list`, filtrando per slug.
4. **Salvataggio** (`POST /api/admin/partnership/save`) — un solo
   endpoint per creazione e aggiornamento: valida il payload (Zod),
   verifica la transizione di stato richiesta contro il ruolo, genera il
   frontmatter in modo deterministico, tenta il commit GitHub.
5. **Pubblicazione pubblica** — solo `stato: published` genera una pagina
   su `/partnership/[slug]` (vedi §10 CMS_ARCHITECTURE per il meccanismo);
   negli altri stati la pagina non esiste nemmeno (`getStaticPaths`
   filtra, non solo l'indice).

**Limite architetturale intrinseco, non un difetto introdotto ora**: le
Content Collections di Astro sono uno snapshot dell'ultimo build. In
locale (`astro dev`) l'elenco è sempre aggiornato in tempo reale; in
produzione, dopo un salvataggio riuscito, il contenuto compare nel
pannello (e sul sito pubblico) solo dopo il prossimo deploy innescato dal
commit su GitHub. Il pannello lo dichiara esplicitamente in UI (campo
`nota` nella risposta di `/api/admin/partnership/list`).

---

## 5. File modificati

| File | Modifica |
|---|---|
| `src/content/config.ts` | Aggiunto `stato` (draft/review/published/archived, default `published`) alla collection `partnership`; `attiva` mantenuto come legacy, non più letto dalle pagine pubbliche |
| `src/pages/partnership/index.astro` | Filtro pubblico ora su `stato === 'published'` (era `attiva`) |
| `src/pages/partnership/[slug].astro` | `getStaticPaths` ora filtra `stato === 'published'` — un contenuto non pubblicato non genera più nemmeno la pagina, anche a URL noto |
| `src/env.d.ts` | Aggiunta `GITHUB_SERVICE_TOKEN` |
| `.env.example` | Documentata `GITHUB_SERVICE_TOKEN` (server-only) |
| `package.json` | Aggiunto script `cms:verify` |
| `supabase/migrations/20260712000000_cms_roles.sql` | Corrette le 3 incompatibilità note (vedi `ADMIN_FOUNDATIONS.md` §6) |
| `docs/ADMIN_FOUNDATIONS.md` | Corretta l'attribuzione allo sprint della correzione di `cms_roles.sql` |

## 6. File creati

```
src/lib/admin/
  roles.ts            matrice permessi/transizioni, pura, zero dipendenze
  auth-client.ts       auth lato browser (solo client Supabase anon)
  auth-server.ts       auth lato server (verifica token + service role)
  audit.ts             audit log best-effort, fallback esplicito
  github.ts             commit GitHub server-side, fallisce esplicitamente se non configurato
  content-utils.ts     slug/path/frontmatter — pure, testabili da Node puro
  validation.ts        schema Zod del form Partnership

src/layouts/AdminLayout.astro          layout condiviso pannello CMS
src/components/admin/PartnershipForm.astro   form condiviso creazione/modifica

src/pages/admin/
  index.astro                          dashboard
  partnership/index.astro              elenco + ricerca + filtro
  partnership/nuova.astro              creazione
  partnership/[slug].astro             modifica (SSR)
  utenti/index.astro                   scaffold gestione utenti (super_admin)

src/pages/api/admin/
  partnership/list.ts                  GET, auth-gated
  partnership/save.ts                  POST, auth+ruolo+transizione-gated
  audit/recent.ts                      GET, auth-gated
  users/list.ts                        GET, auth-gated (sempre 403 in compatibilità)

scripts/verify-cms-sprint3.mjs         41 asserzioni, node puro, nessun framework nuovo
```

---

## 7. Variabili ambiente

| Variabile | Ambito | Obbligatoria | Stato |
|---|---|---|---|
| `GITHUB_SERVICE_TOKEN` | Server, solo `src/lib/admin/github.ts` | Sì, per i salvataggi reali | Vedi `docs/CMS_SPRINT_3_1.md` per lo stato di attivazione |
| `GITHUB_REPO_OWNER` | Server, solo `src/lib/admin/github.ts` | No — default `areanuova` | Aggiunta Sprint 3.1 |
| `GITHUB_REPO_NAME` | Server, solo `src/lib/admin/github.ts` | No — default `area-nuova` | Aggiunta Sprint 3.1 |
| `GITHUB_REPO_BRANCH` | Server, solo `src/lib/admin/github.ts` | No — default `main` | Aggiunta Sprint 3.1 |

Nessuna nuova variabile Supabase: il pannello riusa `PUBLIC_SUPABASE_URL`,
`PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` già esistenti.

---

## 8. Integrazione GitHub

`src/lib/admin/github.ts` implementa "Create or update file contents"
(`PUT /repos/areanuova/area-nuova/contents/{path}`) con:

- lettura dello `sha` corrente prima di un update (gestione conflitto: se
  qualcun altro ha modificato il file nel frattempo, GitHub rifiuta la
  richiesta con 409/422, propagato come errore leggibile, mai una
  sovrascrittura silenziosa);
- messaggio di commit descrittivo (`Crea/Aggiorna partnership "X" (stato)
  via pannello admin`);
- verifica indipendente anti path-traversal sul path finale, oltre a
  quella già fatta in `validation.ts`/`content-utils.ts` (difesa a più
  livelli, non un solo controllo di cui fidarsi).

**Non testato end-to-end** (nessun token disponibile): la chiamata reale a
`api.github.com` non è mai stata eseguita in questo sprint. Il codice è
stato validato per struttura e per la gestione esplicita dell'assenza di
token, non per un commit reale riuscito.

---

## 9. Audit log

`src/lib/admin/audit.ts` tenta sempre la scrittura su `cms_audit_log`
(inesistente finché `cms_roles.sql` non è applicata) e intercetta
esplicitamente l'errore "relation does not exist" (`42P01`), senza mai
interrompere l'operazione principale. **Verificato in questo sprint**: ogni
salvataggio Partnership (anche quelli falliti per assenza di
`GITHUB_SERVICE_TOKEN`) tenta comunque di registrare l'evento, fallisce
silenziosamente sul lato audit e prosegue — l'utente non vede mai un
errore di audit log al posto dell'esito reale della sua operazione.

---

## 10. Limiti noti

- **Modalità compatibilità permanente finché `cms_roles.sql` non è
  applicata**: nessun vero `super_admin` esiste, `/admin/utenti` resta
  inaccessibile per chiunque (comportamento voluto, non un bug).
- **GitHub non configurato**: nessun salvataggio reale possibile in questo
  ambiente. Il pannello è completo e testabile in ogni sua parte tranne
  l'ultimo passo.
- **Elenco Partnership non in tempo reale in produzione** (vedi §4) —
  intrinseco all'architettura Content Collections, non specifico di questo
  sprint.
- **MIME/firma file non riguarda questo modulo**: Partnership non gestisce
  upload immagini in questo sprint (campo `logo` è un percorso testuale,
  non un uploader) — nessuna sovrapposizione con l'hardening Storage già
  applicato ad Alloggi.
- **Nessun controllo CSRF dedicato** sulle route `/api/admin/*`: il rischio
  è mitigato dal fatto che l'autenticazione richiede un Bearer token letto
  da `sessionStorage`/memoria JS (mai un cookie inviato automaticamente dal
  browser), quindi un sito terzo non può montare una richiesta CSRF
  "silenziosa" — un attacco dovrebbe comunque esfiltrare il token, un
  problema diverso (XSS) già mitigato dall'assenza di `innerHTML` con dati
  non sanitizzati nel pannello. Non un controllo CSRF esplicito, ma un
  design che non ne ha bisogno nella forma classica (nessuna sessione
  cookie-based da "cavalcare").
- **Doppio invio modulo**: il pulsante di submit si disabilita durante la
  richiesta (`submitBtn.disabled = true`), non un lock lato server — un
  doppio click quasi simultaneo potrebbe teoricamente generare due commit
  ravvicinati; a basso rischio pratico (GitHub stesso serializza le
  richieste sullo stesso file via `sha`), non risolto in modo esaustivo in
  questo sprint.

## 11. Procedura di test

**Eseguito in questo sprint** (`npm run cms:verify`, 41 asserzioni, node
puro): matrice permessi completa, tutte le transizioni di stato per
ciascun ruolo, validazione URL (rifiuta `javascript:`/`data:`, accetta solo
`https://`), validazione slug (rifiuta maiuscole, path traversal, slash,
stringa vuota), path anti-traversal, determinismo della generazione
frontmatter, quoting YAML corretto per valori con caratteri speciali.

**Verificato per costruzione/ispezione del codice** (non eseguibile senza
un ambiente di deploy reale con sessioni utente vere): redirect a login se
non autenticato (`AdminLayout`, stato `admin-boot-login`); blocco per
ruolo insufficiente (`hasRole()` in `boot()`); editor non può pubblicare
(`canTransition('editor', ..., 'published')` sempre `false`, già coperto
dal punto sopra + riverificato server-side in `save.ts`); slug invalido
rifiutato (schema Zod + `isSafeSlug`); contenuto non pubblicato assente
dal sito pubblico (`getStaticPaths` filtra `stato==='published'`); CTA
assente se `link` vuoto (già presente prima di questo sprint, invariato);
nessun secret nel bundle client (**verificato per davvero**, non solo per
ispezione — grep sull'intero output statico dopo build, vedi §2).

**Non verificabile in questo sprint** (richiederebbe login reali con
utenti di ruoli diversi su un deploy vero): il comportamento end-to-end
completo con una sessione autenticata reale.

---

## 12. Rollback

Nessuna modifica remota è stata eseguita in questo sprint — non serve un
rollback database. Rollback del codice: tutti i file sono nuovi o
modifiche locali non committate; `git checkout` sui file elencati in §5
oppure la rimozione dei file elencati in §6 riporta il repository allo
stato precedente allo sprint. La collection `partnership` resta
retrocompatibile: rimuovendo il campo `stato` dallo schema, le pagine
pubbliche tornerebbero a leggere `attiva` solo se si ripristina anche la
riga di filtro corrispondente nei due file di `src/pages/partnership/`.

---

## 13. Prerequisiti per estendere il CMS

1. **Applicare `cms_roles.sql`** (richiede un canale DDL: Supabase CLI
   collegata con `SUPABASE_ACCESS_TOKEN`, o accesso diretto a Postgres) —
   sblocca ruoli reali e `/admin/utenti`.
2. **Configurare `GITHUB_SERVICE_TOKEN`** (Personal Access Token
   fine-grained, permesso "Contents: Read and write" limitato a questo
   repository, o GitHub App) — sblocca i salvataggi reali.
3. Una volta verificato il modulo Partnership in produzione con entrambi i
   prerequisiti sopra, replicare lo stesso pattern (`content-utils.ts` +
   form component + 2 route API + 3 pagine) per le collection successive
   indicate in `CMS_ARCHITECTURE.md` §4 — a partire da News, che ha già il
   campo `bozza` storico da armonizzare con il nuovo `stato`.
4. Valutare l'introduzione di Pull Request invece di commit diretti su
   `main` per il ruolo Editor (già previsto in `CMS_ARCHITECTURE.md` §2.2,
   non implementato in questo sprint: il pilota commista direttamente,
   dato che l'unico stato raggiungibile da un editor è comunque
   draft/review, mai pubblicato).
