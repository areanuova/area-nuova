# PROJECT_STATUS.md — Area Nuova / Aris

_Ultimo aggiornamento: 2026-06-30_

---

## Stato build

| Check | Risultato |
|---|---|
| `npm run build` | ✅ 0 errori |
| `npx astro check` | ✅ 0 errori, 0 warning, 1 hint (solo test script) |
| Runtime Vercel | nodejs22.x (patchato da postbuild) |
| API routes | 7 route iniettate prima di `handle:filesystem` |

---

## Stato produzione (ultimo deployment: `dpl_7Tu8qXL8nusNtspbXaychkCDivAg`)

| Endpoint | Stato | Note |
|---|---|---|
| `GET /api/health` | ✅ 200 | |
| `POST /api/chat` | ✅ SSE funzionante | Gemini 2.0 Flash |
| `GET /admin/aris` | ✅ 200 | Dashboard admin |
| `POST /api/search` | ❌ 500 | **Richiede redeploy** — env var non disponibile al runtime |
| `POST /api/aris/feedback` | ❌ 500 | **Richiede redeploy** — env var non disponibile al runtime |
| `GET /api/aris/admin-stats` | ⚠️ non testato | Auth richiesta |
| `POST /api/aris/sync-external` | ⚠️ non testato | Cron job |
| `POST /api/index-content` | ⚠️ non testato | Admin only |

---

## Causa reale degli errori 500

Le env var (`GEMINI_API_KEY`, `PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) sono
state aggiunte al progetto Vercel **dopo** l'ultimo deployment. In Vercel le env var
server-side diventano disponibili ai serverless functions **solo dopo un redeploy**.

**Fix: eseguire `vercel --prod --force`** — nessuna modifica al codice necessaria.

---

## Fix implementati in questa sessione

### Infrastruttura (sessione precedente)
- `.vercelignore` corretto: `api/` → `/api/` (causa root dei 404 su tutte le API)
- `scripts/astro-build.mjs`: wrapper che unset `VERCEL` durante build per includere `src/pages/api/`
- `scripts/patch-vercel-runtime.mjs`: postbuild che patcha nodejs18→22 e inietta route `/api/*`
- `vercel.json`: cron cambiato da `0 * * * *` a `0 3 * * *` (limite Hobby plan)
- Admin dashboard: rimossa password hardcoded, auth server-side via `ARIS_ADMIN_SECRET`, token in `sessionStorage`

### Qualità (sessione corrente)
- **Admin dashboard**: label "ultimi 50" → conteggio dinamico reale
- **Admin dashboard**: eliminato doppio API call su login e ripristino sessione (`dataLoaded` flag)
- **Widget Aris**: `md()` aggiunto supporto link markdown `[testo](url)` — i tool con `noLlm:true` che emettono link ora li rendono cliccabili

---

## Architettura Aris

```
/api/chat  →  Agent  →  Planner (deterministico)  →  Tool selezionato
                                                       ├── IdentityTool     (noLlm)
                                                       ├── AlloggiTool      (noLlm, Supabase live)
                                                       ├── ConvenzioniTool  (noLlm, aris_documents)
                                                       ├── WhatsAppTool     (noLlm, aris_documents)
                                                       ├── NewsTool         (noLlm, aris_documents)
                                                       ├── GuideTool        (Gemini, aris_documents)
                                                       ├── RegolamentiTool  (Gemini, RAG)
                                                       ├── RappresentantiTool (Gemini, RAG)
                                                       ├── ExternalOfficialSourcesTool (condiz., aris_external_documents)
                                                       └── RagTool          (Gemini, pgvector fallback)
```

**AI Provider attivo**: Gemini 2.0 Flash (`AI_PROVIDER=gemini`)
**Embedding**: non supportato con Gemini → RAG/search non funzionano senza OpenAI key

---

## Prossimi passi obbligatori

1. **`vercel --prod --force`** per attivare le env var nei serverless functions
2. Verificare dopo il redeploy: `/api/search` e `/api/aris/feedback`
3. (Opzionale) Se si vuole il RAG funzionante, aggiungere `OPENAI_API_KEY` e impostare `AI_PROVIDER=openai`

---

## Migrazioni Supabase (da verificare)

Eseguire `supabase/migrations/ALL_MIGRATIONS.sql` nel SQL Editor di Supabase se le tabelle non esistono:
- `aris_documents`
- `aris_embeddings` (con pgvector 1536 dim)
- `aris_feedback`
- `aris_external_documents`
- Funzione RPC `aris_search`
