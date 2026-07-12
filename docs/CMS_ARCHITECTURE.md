# Architettura CMS — Area Nuova (Sprint 3)

Documento di progettazione. **Nessuna schermata è stata implementata**: questo
documento definisce l'architettura target affinché più rappresentanti possano
gestire il sito senza usare VS Code, GitHub o la dashboard Vercel.

---

## 1. Stato attuale (ricognizione)

Il progetto ha oggi **tre sistemi di amministrazione separati e non integrati**:

| Sistema | Cosa gestisce | Autenticazione | Limite principale |
|---|---|---|---|
| **Decap CMS** (`public/admin/` + `api/auth.js` + `api/callback.js`) | Rappresentanti, Progetti, Risultati, News, Eventi, Guide, Documenti, Convenzioni (git-based, commit diretto su `main`) | OAuth GitHub (`repo,user` scope) | Ogni redattore deve avere un account GitHub con permessi di scrittura sul repo — esattamente ciò che il mandato vuole evitare. Nessun concetto di ruolo: chi accede può modificare tutto e pubblica direttamente su `main` senza revisione. |
| **`/admin/alloggi`** | Annunci alloggi | Supabase Auth (magic link) + tabella `admin_users` (allow-list flat: `id`, `email`) + RLS | Un solo indirizzo email ammesso, hardcoded nel frontend (`ADMIN_EMAIL`). Nessun ruolo, nessuna gestione multi-utente. |
| **`/admin/aris`** | Dashboard statistiche Aris | Header `x-admin-secret` condiviso (`ARIS_ADMIN_SECRET`) | Segreto condiviso, non nominale: non si può revocare l'accesso a una singola persona. |

Punto di forza da riusare: **`/admin/alloggi` è l'unico dei tre già basato su
un'autenticazione nominale reale (Supabase Auth) con una tabella di
autorizzazione lato DB e RLS** — è la base tecnica corretta su cui costruire
il CMS, come indicato nel mandato. Decap CMS resta valido come riferimento
per lo *schema dei campi* (già definito e allineato agli schema Zod in
`src/content/config.ts`), ma il suo modello di auth (GitHub OAuth) va sostituito.

---

## 2. Architettura target

### 2.1 Identità e ruoli

Estendere `admin_users` (già esistente) con un ruolo, invece di creare un
sistema parallelo. Migration proposta (non eseguita):
`supabase/migrations/20260712000000_cms_roles.sql`.

```
admin_users
├─ id            uuid
├─ email         text          (univoco, login via Supabase Auth magic link)
├─ nome          text
├─ role          enum: super_admin | admin | editor
├─ attivo        boolean       (per rimuovere l'accesso senza cancellare lo storico)
├─ creato_da     uuid → admin_users.id
└─ created_at    timestamptz

cms_audit_log
├─ admin_id      uuid → admin_users.id
├─ azione        create | update | delete | publish
├─ collezione    'news' | 'guide' | 'alloggi' | ...
├─ entry_id      slug o id
└─ dettagli      jsonb
```

**Matrice permessi:**

| Azione | Super Admin | Admin | Editor |
|---|:---:|:---:|:---:|
| Aggiungere/rimuovere amministratori | ✅ | ❌ | ❌ |
| Gestire Homepage, Banner, config sito | ✅ | ✅ | ❌ |
| Creare/pubblicare News, Guide, Eventi, Convenzioni, Partnership, Gruppi WhatsApp | ✅ | ✅ | ✅ (in bozza, richiede approvazione) |
| Approvare/pubblicare le bozze di un Editor | ✅ | ✅ | ❌ |
| Gestire Alloggi (moderazione annunci) | ✅ | ✅ | ✅ |
| Caricare Documenti/Mozioni ufficiali | ✅ | ✅ | ❌ (proposta, non pubblica) |
| Gestire sezione Video | ✅ | ✅ | ✅ (in bozza) |
| Consultare audit log | ✅ | ✅ | ❌ |

Il campo `bozza` esiste già nello schema `news` (`src/content/config.ts`):
il flusso "editor propone → admin/super admin pubblica" è quindi già
rappresentabile con l'unico aggiustamento di **non esporre pubblicamente le
entry con `bozza: true`** finché non promosse — comportamento da estendere
per coerenza a Guide, Convenzioni, Partnership, Documenti (aggiungendo lo
stesso flag dove manca).

### 2.2 Storage dei contenuti: due strategie, per tipo di contenuto

Non tutti i contenuti hanno gli stessi requisiti di aggiornamento. Continuare
a usare **Astro Content Collections** dove il contenuto è editoriale e
poco frequente ha vantaggi enormi (type-safety con Zod, nessuna nuova
infrastruttura, build statica veloce, git come storico/versionamento).
Serve però disaccoppiare "modificare un contenuto" da "avere accesso a
GitHub", cosa che oggi fa solo Decap CMS collegando i due concetti.

**Strategia proposta:**

- **Contenuto editoriale (git-backed, invariato nello storage):**
  News, Mozioni/Documenti, Guide, Convenzioni, Partnership, Gruppi WhatsApp,
  Eventi, Progetti, Risultati, Rappresentanti, Video, Homepage/Banner (nuovo
  file `src/data/homepage.json`).

  Il futuro pannello Admin (Astro, route `/admin/cms/*`, protetta da
  Supabase Auth + ruolo) espone form generati dagli stessi schema Zod di
  `src/content/config.ts` (single source of truth, zero duplicazione).
  Al salvataggio, un endpoint server-side (`/api/admin/content/[collezione]`)
  scrive il file Markdown/JSON e lo **committa via GitHub REST API usando
  una GitHub App/PAT di servizio, mai esposta al browser**. Il rappresentante
  non vede né usa GitHub: dal suo punto di vista compila un form e clicca
  "Pubblica". Per il ruolo Editor, l'endpoint apre un branch + Pull Request
  invece di committare su `main`; Admin/Super Admin possono committare
  direttamente o approvare la PR da una vista "richieste in attesa" nello
  stesso pannello (senza aprire GitHub). Il push su `main` fa scattare il
  deploy Vercel automatico esistente: nessuno tocca la dashboard Vercel.

  Questo permette di **spegnere Decap CMS** (resta comunque accessibile e
  non va cancellato, per continuità) una volta che il nuovo pannello copre
  le stesse collezioni.

- **Contenuto operativo/ad alta frequenza (DB-backed, come oggi):**
  Alloggi resta su Supabase (già così). Lo stesso pattern va riusato per
  qualunque futura sezione che richieda aggiornamenti continui senza
  passare da un rebuild del sito.

### 2.3 Pannello Admin unificato

Un'unica app sotto `/admin`, con:

- **Login** condiviso (Supabase Auth magic link) per tutte le sezioni —
  sostituisce sia il flusso di `/admin/alloggi` sia l'header condiviso di
  `/admin/aris`.
- **Sidebar per ruolo**: le voci di menu (News, Mozioni, Guide, Convenzioni,
  Partnership, Gruppi WhatsApp, Alloggi, Documenti, Homepage, Banner, Video,
  Gestione amministratori) si mostrano/nascondono in base a `role`, sia lato
  client (UX) sia lato server (RLS + controllo nell'endpoint — mai fidarsi
  del solo client).
- **Gestione amministratori** (solo Super Admin): form per invitare un nuovo
  admin via email (Supabase `inviteUserByEmail`), assegnare ruolo, disattivare
  un account (`attivo = false`) senza cancellarne lo storico/audit.

### 2.4 Perché non rifare tutto su Supabase

Un'alternativa più "pura" sarebbe spostare **tutti** i contenuti in tabelle
Supabase e rendere il sito interamente SSR. È stata scartata per questo
Sprint perché: richiederebbe riscrivere ogni pagina pubblica (oggi basate su
`getCollection()` statico), perderebbe la revisione via git dei contenuti
editoriali, e introdurrebbe un costo di query/hosting non necessario per
contenuto che cambia poche volte al mese. L'approccio ibrido (git per
l'editoriale, DB per l'operativo) è già il pattern in uso nel progetto
(Alloggi vs. il resto) e viene solo esteso, non stravolto.

---

## 3. Cosa NON è stato implementato in questo Sprint

Come da mandato, nessuna schermata è stata costruita. Sono stati preparati
solo:

- `supabase/migrations/20260712000000_cms_roles.sql` — migration proposta
  (ruoli + audit log), **non eseguita** sul database.
- Questo documento di architettura.

---

## 4. Piano per lo Sprint 3

1. Eseguire la migration `20260712000000_cms_roles.sql` su Supabase.
2. Costruire `/admin/login` unico (Supabase Auth) e rimuovere l'header
   condiviso di `/admin/aris` e l'`ADMIN_EMAIL` hardcoded in `/admin/alloggi`.
3. Implementare `/api/admin/content/[collezione]` (lettura/scrittura via
   GitHub API) partendo da **una sola collezione pilota** (es. News, che ha
   già il flag `bozza`).
4. Costruire la UI di "Gestione amministratori" (solo Super Admin).
5. Estendere il flag `bozza`/stato di revisione alle altre collezioni
   editoriali (Guide, Convenzioni, Partnership, Documenti).
6. Estendere il pannello alle collezioni rimanenti, una alla volta.
7. Modellare Homepage/Banner come file di configurazione dedicato
   (`src/data/homepage.json`) gestibile dallo stesso meccanismo.
8. Solo a copertura completa, disattivare Decap CMS (senza cancellarlo).
