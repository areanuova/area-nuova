import * as https from 'node:https';
import type { FetchResult, RobotsRules } from './types';

const USER_AGENT    = 'ArisBot/1.0 (+https://areanuova.it/aris; university-assistant; educational)';
const FETCH_TIMEOUT = 12_000;
const RATE_DELAY_MS = 1_500;

const robotsCache = new Map<string, RobotsRules>();
const lastFetch   = new Map<string, number>();

// ── robots.txt ────────────────────────────────────────────────────────────────

function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { disallowed: [], allowed: [], crawlDelayMs: RATE_DELAY_MS };
  let applicable = false;

  for (const rawLine of text.split('\n')) {
    const line  = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();

    if (field.toLowerCase() === 'user-agent') {
      applicable = value === '*' || value.toLowerCase().includes('arisbot');
      continue;
    }

    if (!applicable) continue;

    if (field.toLowerCase() === 'disallow' && value) {
      rules.disallowed.push(value);
    } else if (field.toLowerCase() === 'allow' && value) {
      rules.allowed.push(value);
    } else if (field.toLowerCase() === 'crawl-delay' && value) {
      const delay = parseFloat(value);
      if (!isNaN(delay)) rules.crawlDelayMs = Math.max(delay * 1000, RATE_DELAY_MS);
    }
  }

  return rules;
}

export async function loadRobots(baseUrl: string): Promise<RobotsRules> {
  const key = new URL(baseUrl).origin;
  if (robotsCache.has(key)) return robotsCache.get(key)!;

  const fallback: RobotsRules = { disallowed: [], allowed: [], crawlDelayMs: RATE_DELAY_MS };

  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res   = await fetch(`${key}/robots.txt`, {
      signal:  ctrl.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timer);
    if (res.ok) {
      const rules = parseRobots(await res.text());
      robotsCache.set(key, rules);
      return rules;
    }
  } catch { /* assume permissive if unreachable */ }

  robotsCache.set(key, fallback);
  return fallback;
}

export function isAllowed(urlStr: string, rules: RobotsRules): boolean {
  let path: string;
  try { path = new URL(urlStr).pathname; } catch { return false; }

  for (const a of rules.allowed)    { if (path.startsWith(a)) return true; }
  for (const d of rules.disallowed) { if (d && path.startsWith(d)) return false; }
  return true;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

async function applyRateLimit(hostname: string, delayMs: number): Promise<void> {
  const last = lastFetch.get(hostname) ?? 0;
  const wait = delayMs - (Date.now() - last);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastFetch.set(hostname, Date.now());
}

// ── TLS-bypass fetch (node:https, solo per siti con catena cert incompleta) ───

async function fetchInsecureHttps(url: string): Promise<FetchResult> {
  return new Promise((resolve) => {
    const u     = new URL(url);
    const timer = setTimeout(() => { req.destroy(); resolve({ url, html: '', status: 0, ok: false, error: 'timeout' }); }, FETCH_TIMEOUT);

    const req = https.request(
      {
        hostname:             u.hostname,
        path:                 u.pathname + u.search,
        method:               'GET',
        rejectUnauthorized:   false,
        headers: {
          'User-Agent':      USER_AGENT,
          'Accept':          'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
        },
      },
      (res) => {
        // Follow single redirect
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          clearTimeout(timer);
          req.destroy();
          try {
            const redirect = new URL(res.headers.location, url).href;
            fetchInsecureHttps(redirect).then(resolve);
          } catch {
            resolve({ url, html: '', status: res.statusCode, ok: false, error: 'bad redirect' });
          }
          return;
        }

        const ct = res.headers['content-type'] ?? '';
        if (!ct.includes('text/html') && !ct.includes('text/plain')) {
          clearTimeout(timer);
          resolve({ url, html: '', status: res.statusCode ?? 0, ok: false, error: 'non-html content' });
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          clearTimeout(timer);
          const html   = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          resolve({ url, html, status, ok: status >= 200 && status < 400 });
        });
        res.on('error', (err: Error) => {
          clearTimeout(timer);
          resolve({ url, html: '', status: 0, ok: false, error: err.message });
        });
      },
    );

    req.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({ url, html: '', status: 0, ok: false, error: err.message });
    });

    req.end();
  });
}

// ── Standard fetch ────────────────────────────────────────────────────────────

async function fetchStandard(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: {
        'User-Agent':      USER_AGENT,
        'Accept':          'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
      },
    });
    clearTimeout(timer);

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) {
      return { url, html: '', status: res.status, ok: false, error: 'non-html content' };
    }

    const html = await res.text();
    return { url, html, status: res.status, ok: res.ok };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { url, html: '', status: 0, ok: false, error: msg };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchPage(
  url:               string,
  robots:            RobotsRules,
  allowInsecureTls = false,
): Promise<FetchResult> {
  if (!isAllowed(url, robots)) {
    return { url, html: '', status: 0, ok: false, error: 'disallowed by robots.txt' };
  }

  const { hostname } = new URL(url);
  await applyRateLimit(hostname, robots.crawlDelayMs);

  return allowInsecureTls ? fetchInsecureHttps(url) : fetchStandard(url);
}

export function clearRobotsCache(): void {
  robotsCache.clear();
}
