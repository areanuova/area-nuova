/**
 * Runs `astro build` with VERCEL unset so that @astrojs/vercel includes ALL
 * server-side routes (including src/pages/api/*) in the _render bundle.
 *
 * Historical reason: when the project root contained an api/ directory
 * (legacy Decap CMS OAuth handlers), `vercel build` set VERCEL=1 and the
 * adapter skipped bundling /api/* route handlers, assuming those paths would
 * be served by Vercel Functions in the root api/ directory instead. Since
 * .vercelignore excluded those files, every /api/* request 404'd.
 *
 * As of Sprint 2.1 the root api/ directory no longer exists — the OAuth
 * handlers were migrated into src/pages/api/ (see src/pages/api/auth.ts).
 * This wrapper is kept as a safety net (unsetting VERCEL is harmless even
 * without a root api/ directory) since removing it has not been verified
 * against a real Vercel build in this sprint (no deploy access). Revisit
 * once a real deploy confirms the adapter behaves correctly without it.
 *
 * Unsetting VERCEL here does NOT change the output format — the adapter is
 * explicitly selected in astro.config.mjs and always emits .vercel/output/.
 */
import { execSync } from 'child_process';

const env = { ...process.env };
delete env.VERCEL;
delete env.VERCEL_ENV;

execSync('astro build', { stdio: 'inherit', env });
