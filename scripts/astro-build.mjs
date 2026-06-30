/**
 * Runs `astro build` with VERCEL unset so that @astrojs/vercel includes ALL
 * server-side routes (including src/pages/api/*) in the _render bundle.
 *
 * Without this, when the project root contains an api/ directory, vercel build
 * sets VERCEL=1 and the adapter skips bundling /api/* route handlers, assuming
 * those paths will be served by Vercel Functions in the root api/ directory.
 * Since those files are excluded via .vercelignore, every /api/* request 404s.
 *
 * Unsetting VERCEL here does NOT change the output format — the adapter is
 * explicitly selected in astro.config.mjs and always emits .vercel/output/.
 */
import { execSync } from 'child_process';

const env = { ...process.env };
delete env.VERCEL;
delete env.VERCEL_ENV;

execSync('astro build', { stdio: 'inherit', env });
