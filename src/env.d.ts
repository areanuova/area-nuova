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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
