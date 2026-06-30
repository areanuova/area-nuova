import { ARIS_CONFIG } from './config';
import type { ChatMessage } from './types';

// In-memory rate limiter (si resetta a ogni cold start — sufficiente per MVP)
const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  maxReqs: number,
  windowMs: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxReqs - 1 };
  }

  if (entry.count >= maxReqs) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: maxReqs - entry.count };
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'anonymous'
  );
}

const INJECTION = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions?/i,
  /forget\s+(everything|all|previous)/i,
  /pretend\s+(you('re| are)|to\s+be)/i,
  /\bact\s+as\b/i,
  /jailbreak/i,
  /\bdisregard\b/i,
  /you\s+are\s+now\s+/i,
  /override\s+(your\s+)?(safety|instructions?|rules?)/i,
  /system\s+prompt/i,
  /\bDAN\b/,
];

export function hasInjection(text: string): boolean {
  return INJECTION.some((p) => p.test(text));
}

export function sanitize(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, ARIS_CONFIG.maxInputLength);
}

export interface ValidationResult {
  ok:       true;
  message:  string;
  history:  ChatMessage[];
  context?: string;
}

export interface ValidationError {
  ok: false;
  error: string;
}

export function validateChatBody(
  body: unknown,
): ValidationResult | ValidationError {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Richiesta non valida.' };
  }

  const { message, history, context } = body as Record<string, unknown>;

  if (typeof message !== 'string' || !message.trim()) {
    return { ok: false, error: 'Il campo "message" è obbligatorio.' };
  }

  const clean = sanitize(message);

  if (clean.length < 2) {
    return { ok: false, error: 'Messaggio troppo breve.' };
  }

  if (hasInjection(clean)) {
    return { ok: false, error: 'Messaggio non consentito.' };
  }

  const safeHistory: ChatMessage[] = [];
  if (Array.isArray(history)) {
    for (const m of history.slice(-ARIS_CONFIG.maxHistoryMessages)) {
      if (
        m &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
      ) {
        safeHistory.push({
          role: m.role as 'user' | 'assistant',
          content: sanitize(m.content),
        });
      }
    }
  }

  const safeContext = typeof context === 'string'
    ? context.trim().slice(0, 200)
    : undefined;

  return { ok: true, message: clean, history: safeHistory, context: safeContext || undefined };
}
