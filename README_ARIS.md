# Aris 1.0 — Assistente AI di Area Nuova

Aris è l'assistente digitale ufficiale di Area Nuova, integrato nel sito UniFg. È un **AI Agent basato su Tool** con pipeline deterministica, cache query, personalizzazione studente e navigazione copilot.

---

## Architettura

```
Domanda studente → [ArisWidget]
                        │ POST /api/chat { message, history, context? }
                        ▼
               [security.ts] — rate limit, sanitize, validate
                        │
                        ▼
               [cache/normalize.ts] — normalizzazione sinonimi
                        │
               [cache/cache.ts] — hit? → risposta immediata
                        │
                        ▼
               [agent/planner.ts] — scoring deterministico (NO LLM)
                        │ seleziona tool
                        ▼
               [agent/executor.ts] — esegue il tool
                        │
                        ▼
         ┌─────────────────────────────┐
         │ Tool Result                 │
         │ { data, confidence, noLlm,  │
         │   sources, actions }        │
         └─────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          │ confidence < 50?           │ noLlm = true?
          ▼                            ▼
    "Non trovato"             → risposta diretta
                                        │
                              ┌─────────┴──────────┐
                              ▼                    ▼
                       [GeminiProvider] → [OpenRouter fallback]
                              │
                              ▼
                    SSE streaming → Widget
```

---

## Tool Registry

| Tool | ID | Score | Descrizione |
|------|----|-------|-------------|
| IdentityTool | identity | 90 | Chi è Aris (noLlm=true) |
| AlloggiTool | alloggi | 85 | Annunci case/stanze/appartamenti |
| ExternalOfficialSourcesTool | external-official | 82 | UniFg, ADISU, MUR |
| ConvenzioniTool | convenzioni | 80 | Discount Card, sconti, negozi |
| WhatsAppTool | whatsapp | 80 | Gruppi WhatsApp corsi |
| GuideTool | guide | 80 | Guide universitarie, procedure |
| RegolamentoTool | regolamenti | 78 | Regolamenti e statuti |
| RappresentantiTool | rappresentanti | 78 | Rappresentanti studenteschi |
| NewsTool | news | 75 | News e comunicati Area Nuova |
| RagTool | rag | — | Fallback: ricerca semantica pgvector |

---

## Funzionalità principali

### Tool-First (bypassa LLM)
I tool con `noLlm: true` o `llmReasoningNeeded: false` restituiscono la risposta direttamente senza chiamare Gemini. Tool che bypassano sempre Gemini: `IdentityTool`, `ConvenzioniTool`, `WhatsAppTool`, `AlloggiTool`, `NewsTool`. Tool che usano Gemini solo per query complesse: `ExternalOfficialSourcesTool`. Tool che usano sempre Gemini (dati da sintetizzare): `GuideTool`, `RegolamentiTool`, `RagTool`.

### Navigation Copilot
I tool restituiscono `actions: NavigationAction[]` che il widget renderizza come bottoni cliccabili:
- `navigate` — vai alla pagina
- `open-filter` — vai con filtri URL (es. alloggi con prezzo max)
- `search` — vai con query di ricerca
- `external-link` — apri sito esterno in nuova tab
- `copy` — copia negli appunti

### Cache query
Normalizzazione sinonimi + cache in memoria con TTL 5 min (30 min per tool statici). Massimo 200 entry. Riduce le chiamate Gemini su domande ripetute.

### Personalization
Il widget memorizza corso/anno in `aris-prefs-v1` (localStorage) e li invia come `context` con ogni richiesta API. Il context viene iniettato nel system prompt di Gemini.

### Fallback AI (OpenRouter)
Se Gemini raggiunge la quota (429), il `FallbackProvider` tenta automaticamente OpenRouter. Configurazione: aggiungi `OPENROUTER_API_KEY` al `.env`.

---

## Variabili ambiente (.env)

```env
# AI Provider principale
AI_PROVIDER=gemini              # gemini | openai | openrouter
GEMINI_API_KEY=...
GEMINI_CHAT_MODEL=gemini-2.0-flash

# OpenRouter fallback (opzionale)
OPENROUTER_API_KEY=...
OPENROUTER_CHAT_MODEL=mistralai/mistral-7b-instruct:free

# Supabase
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Admin dashboard (OBBLIGATORIO per abilitare /admin/aris)
ARIS_ADMIN_SECRET=...

# OpenAI (per embedding RAG, opzionale)
OPENAI_API_KEY=...
```

---

## Script utili

```bash
# Sincronizza fonti esterne (UniFg, ADISU, MUR)
node scripts/sync-aris-external.mjs
node scripts/sync-aris-external.mjs --force  # ignora freshness

# Test completo (150 domande)
# Prima avvia il dev server: npm run dev
node scripts/test-aris-full.mjs
node scripts/test-aris-full.mjs --url http://localhost:4321

# Indicizza contenuti interni
node scripts/ingest-aris.mjs

# Build + check
npm run build
npx astro check
```

---

## Admin Dashboard

Disponibile su `/admin/aris` — richiede password (default: `areanuova2024`, configurabile via `ARIS_ADMIN_SECRET`).

Mostra:
- Totale feedback, positivi, negativi, score qualità
- Tabella feedback recenti (ultime 200 interazioni)
- Export CSV

---

## Tabelle Supabase

| Tabella | Contenuto |
|---------|-----------|
| `aris_documents` | Contenuti interni (guide, convenzioni, whatsapp, news...) |
| `aris_embeddings` | Embedding pgvector per RAG |
| `aris_external_documents` | Pagine indicizzate da UniFg/ADISU/MUR |
| `aris_external_sources` | Sorgenti esterne registrate |
| `aris_external_sync_logs` | Log sync |
| `aris_feedback` | Feedback 👍👎 degli studenti |

---

## Sicurezza

- Rate limiting per IP (configurable in `config.ts`)
- Sanitizzazione input (strip HTML, trim, max 1000 char)
- Prompt injection detection (pattern regex)
- Validazione body request
- Timeout su LLM calls

---

*Versione 1.0 — Giugno 2026 — Area Nuova UniFg*
