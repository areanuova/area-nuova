// Login OAuth per Decap CMS (/admin): avvia il redirect verso GitHub.
//
// Migrato da api/auth.js (Vercel Function legacy) a route Astro nativa.
// Motivo: .vercelignore esclude l'intera cartella /api/ in root perché la
// presenza di funzioni Vercel "zero-config" lì dentro fa sì che Vercel
// riservi l'intero prefisso /api/* a quelle funzioni, scavalcando le route
// Astro sotto src/pages/api/ (chat, health, aris/*...). Spostando anche
// l'endpoint OAuth sotto src/pages/api/ il conflitto sparisce alla radice:
// tutto /api/* è servito in modo uniforme dal renderer Astro.
//
// Aggiunge anche il parametro "state" (assente nell'implementazione legacy)
// come mitigazione CSRF standard per il flusso OAuth: il valore è generato
// qui, salvato in un cookie httpOnly di breve durata, e verificato in
// callback.ts prima di scambiare il code.
export const prerender = false;

import type { APIContext } from 'astro';

export async function GET({ redirect, cookies }: APIContext): Promise<Response> {
  const clientId = import.meta.env.GITHUB_CLIENT_ID;
  const redirectUri = import.meta.env.REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return new Response(
      "Configurazione mancante: imposta GITHUB_CLIENT_ID e REDIRECT_URI nelle variabili d'ambiente di Vercel.",
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  const state = crypto.randomUUID();
  cookies.set('decap_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minuti: tempo più che sufficiente per completare il login GitHub
    path: '/api/',
  });

  const authUrl =
    'https://github.com/login/oauth/authorize' +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    '&scope=repo,user' +
    `&state=${encodeURIComponent(state)}`;

  return redirect(authUrl, 302);
}
