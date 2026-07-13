import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const VC_CONFIG = '.vercel/output/functions/_render.func/.vc-config.json';
const ROUTES_CONFIG = '.vercel/output/config.json';
const API_PAGES_DIR = 'src/pages/api';
const TARGET_RUNTIME = 'nodejs22.x';

// Patch 1: nodejs18.x → nodejs22.x
try {
  const raw = readFileSync(VC_CONFIG, 'utf8');
  const cfg = JSON.parse(raw);
  if (cfg.runtime === TARGET_RUNTIME) {
    console.log(`[patch-vercel-runtime] already ${TARGET_RUNTIME}, nothing to do.`);
  } else {
    const prev = cfg.runtime;
    cfg.runtime = TARGET_RUNTIME;
    writeFileSync(VC_CONFIG, JSON.stringify(cfg, null, '\t') + '\n');
    console.log(`[patch-vercel-runtime] ${prev} → ${TARGET_RUNTIME}`);
  }
} catch {
  // Not a Vercel build — skip silently
}

// Patch 2: ensure /api/* routes reach _render before handle:filesystem.
//
// When the project root has an api/ directory, vercel build (VERCEL=1)
// strips /api/* routes from the adapter-generated config.json (it reserves
// the whole /api/* prefix for root-level zero-config Functions). As of
// Sprint 2.1 there is no root api/ directory anymore — the Decap CMS OAuth
// endpoints (auth, callback) were migrated into src/pages/api/ precisely to
// remove this conflict at the source. This patch is kept as defense in
// depth in case a root api/ directory is reintroduced in the future.
//
// This patch re-injects the routes using a scan of src/pages/api/ and
// moves them before handle:filesystem so platform-level detection cannot
// shadow them.
try {
  const raw = readFileSync(ROUTES_CONFIG, 'utf8');
  const cfg = JSON.parse(raw);
  const routes = cfg.routes ?? [];

  const fsIdx = routes.findIndex((r) => r.handle === 'filesystem');
  if (fsIdx === -1) {
    console.log('[patch-routes] no handle:filesystem, skipping.');
    process.exit(0);
  }

  // Collect existing /api/* dest:_render routes already in config
  const existingApiRoutes = routes.filter(
    (r) => r.dest === '_render' && typeof r.src === 'string' && r.src.startsWith('^\\/api\\/')
  );
  const existingApiSrcs = new Set(existingApiRoutes.map((r) => r.src));

  // Scan src/pages/api/ to build expected route patterns
  function scanApiDir(dir, prefix = '/api') {
    const result = [];
    let entries;
    try {
      entries = readdirSync(dir);
    } catch (e) {
      console.warn(`[patch-routes] scan failed for "${dir}": ${e.message}`);
      return result;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        result.push(...scanApiDir(full, `${prefix}/${name}`));
      } else if (['.ts', '.js', '.mjs'].includes(extname(name))) {
        const base = name.replace(/\.(ts|js|mjs)$/, '');
        const routePath = base === 'index' ? prefix : `${prefix}/${base}`;
        // Produce the same regex pattern the Astro adapter would generate:
        // /api/health → ^\\/api\\/health\\/?$  (as stored in JSON)
        const escaped = routePath.split('/').join('\\/');
        result.push(`^${escaped}\\/?$`);
      }
    }
    return result;
  }

  const scannedRoutes = scanApiDir(API_PAGES_DIR);
  console.log(`[patch-routes] scanned ${scannedRoutes.length} route(s) from ${API_PAGES_DIR}`);

  // Fallback: hardcoded known API routes (used when scan cannot find src/ files
  // in the remote Vercel build environment)
  const FALLBACK_ROUTES = [
    '^\\/api\\/health\\/?$',
    '^\\/api\\/chat\\/?$',
    '^\\/api\\/search\\/?$',
    '^\\/api\\/index-content\\/?$',
    '^\\/api\\/aris\\/admin-stats\\/?$',
    '^\\/api\\/aris\\/feedback\\/?$',
    '^\\/api\\/aris\\/sync-external\\/?$',
    '^\\/api\\/auth\\/?$',
    '^\\/api\\/callback\\/?$',
  ];

  const expectedSrcs = scannedRoutes.length > 0 ? scannedRoutes : FALLBACK_ROUTES;
  if (scannedRoutes.length === 0) {
    console.log('[patch-routes] scan returned 0 routes — using hardcoded fallback list');
  }

  const missingRoutes = expectedSrcs
    .filter((src) => !existingApiSrcs.has(src))
    .map((src) => ({ src, dest: '_render' }));

  const allApiRoutes = [...existingApiRoutes, ...missingRoutes];

  if (allApiRoutes.length === 0) {
    console.log('[patch-routes] no /api/* routes to inject.');
    process.exit(0);
  }

  // Remove existing api routes from wherever they are, then reinsert before filesystem
  const withoutApi = routes.filter((r) => !existingApiRoutes.includes(r));
  const newFsIdx = withoutApi.findIndex((r) => r.handle === 'filesystem');
  withoutApi.splice(newFsIdx, 0, ...allApiRoutes);
  cfg.routes = withoutApi;

  writeFileSync(ROUTES_CONFIG, JSON.stringify(cfg, null, '\t') + '\n');
  console.log(
    `[patch-routes] ${allApiRoutes.length} /api/* route(s) placed before handle:filesystem` +
    (missingRoutes.length ? ` (${missingRoutes.length} injected)` : '')
  );
} catch (e) {
  console.warn('[patch-routes] skipped:', e.message);
}
