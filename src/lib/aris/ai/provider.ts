import { OpenAIProvider }    from './openai-provider';
import { GeminiProvider }    from './gemini-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { FallbackProvider }  from './fallback-provider';
import type { AIProvider }   from './types';

let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_provider) return _provider;

  const providerName = import.meta.env.AI_PROVIDER ?? 'openai';

  if (providerName === 'openai') {
    const apiKey = import.meta.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('[Aris] OPENAI_API_KEY mancante.');
    _provider = new OpenAIProvider(
      apiKey,
      import.meta.env.OPENAI_EMBEDDING_MODEL,
      import.meta.env.OPENAI_CHAT_MODEL,
    );
    return _provider;
  }

  if (providerName === 'gemini') {
    const apiKey = import.meta.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('[Aris] GEMINI_API_KEY mancante.');
    const primary  = new GeminiProvider(apiKey, import.meta.env.GEMINI_CHAT_MODEL);
    const orKey    = import.meta.env.OPENROUTER_API_KEY;
    if (orKey) {
      // Gemini primary + OpenRouter fallback on quota exhaustion
      const fallback = new OpenRouterProvider(orKey, import.meta.env.OPENROUTER_CHAT_MODEL);
      _provider = new FallbackProvider(primary, fallback);
    } else {
      _provider = primary;
    }
    return _provider;
  }

  if (providerName === 'openrouter') {
    const apiKey = import.meta.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('[Aris] OPENROUTER_API_KEY mancante.');
    _provider = new OpenRouterProvider(apiKey, import.meta.env.OPENROUTER_CHAT_MODEL);
    return _provider;
  }

  throw new Error(
    `[Aris] Provider AI non supportato: "${providerName}". Valori accettati: openai, gemini, openrouter`,
  );
}

export type { AIProvider };
