import type { Source } from '../types';
import type { NavigationAction } from '../navigation/types';

interface CacheEntry {
  content:    string;
  toolId:     string;
  confidence: number;
  sources:    Source[];
  actions?:   NavigationAction[];
  expiresAt:  number;
}

// TTL: 5 minutes for tool results (data can change), 30 min for identity/static
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const STATIC_TTL_MS  = 30 * 60 * 1000;
const STATIC_TOOLS   = new Set(['identity']);

class QueryCache {
  private store = new Map<string, CacheEntry>();

  get(key: string): Omit<CacheEntry, 'expiresAt'> | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    const { expiresAt: _, ...rest } = entry;
    return rest;
  }

  set(
    key: string,
    value: Omit<CacheEntry, 'expiresAt'>,
  ): void {
    const ttl = STATIC_TOOLS.has(value.toolId) ? STATIC_TTL_MS : DEFAULT_TTL_MS;
    this.store.set(key, { ...value, expiresAt: Date.now() + ttl });
    // Evict if cache grows too large (max 200 entries)
    if (this.store.size > 200) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
  }

  invalidate(keyPrefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(keyPrefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export const queryCache = new QueryCache();
