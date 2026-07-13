/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  // Supabase (pubbliche — prefisso PUBLIC_)
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;

  // Supabase — solo server
  readonly SUPABASE_SERVICE_ROLE_KEY: string;

  // OpenAI — solo server
  readonly OPENAI_API_KEY: string;
  readonly OPENAI_EMBEDDING_MODEL?: string;
  readonly OPENAI_CHAT_MODEL?: string;

  // Aris
  readonly ARIS_ADMIN_KEY?: string;
  readonly ARIS_ADMIN_SECRET?: string;
  readonly CRON_SECRET?: string;

  // OpenRouter (opzionale — fallback quando AI_PROVIDER=gemini)
  readonly OPENROUTER_API_KEY?: string;
  readonly OPENROUTER_CHAT_MODEL?: string;

  // Gemini — solo server
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_CHAT_MODEL?: string;

  // AI provider selection (default: 'openai')
  readonly AI_PROVIDER?: string;

  // Decap CMS — OAuth GitHub (src/pages/api/auth.ts, callback.ts)
  readonly GITHUB_CLIENT_ID?: string;
  readonly GITHUB_CLIENT_SECRET?: string;
  readonly REDIRECT_URI?: string;

  // Pannello CMS unificato (Sprint 3) — token di servizio per i commit
  // automatici su GitHub da src/lib/admin/github.ts. Diverso da
  // GITHUB_CLIENT_ID/SECRET sopra (quelli sono per il login OAuth degli
  // utenti di Decap, questo è un Personal Access Token/GitHub App token
  // usato solo server-side, mai da un utente). Non configurato in questo
  // ambiente — vedi docs/CMS_SPRINT_3.md.
  readonly GITHUB_SERVICE_TOKEN?: string;
  // Repository di destinazione dei commit del pannello CMS (Sprint 3.1,
  // opzionali — default "areanuova/area-nuova" su branch "main" se assenti).
  readonly GITHUB_REPO_OWNER?: string;
  readonly GITHUB_REPO_NAME?: string;
  readonly GITHUB_REPO_BRANCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
