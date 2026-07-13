// Callback OAuth per Decap CMS (/admin): GitHub rimanda qui dopo l'autorizzazione.
// Scambia il "code" con un token e lo passa alla finestra di Decap CMS via postMessage.
//
// Migrato da api/callback.js — vedi commento in src/pages/api/auth.ts per il perché
// del trasferimento sotto src/pages/api/. Aggiunge la verifica del parametro "state"
// (assente nell'implementazione legacy) contro il cookie impostato da auth.ts, a
// protezione da CSRF sul callback OAuth.
export const prerender = false;

import type { APIContext } from 'astro';

function htmlPage(message: string): Response {
  const payload = JSON.stringify(message);
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8" /></head><body>
<script>
  (function () {
    function receiveMessage(e) {
      window.opener.postMessage(${payload}, e.origin);
      window.removeEventListener('message', receiveMessage, false);
    }
    window.addEventListener('message', receiveMessage, false);
    window.opener.postMessage('authorizing:github', '*');
  })();
</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET({ url, cookies }: APIContext): Promise<Response> {
  const clientId = import.meta.env.GITHUB_CLIENT_ID;
  const clientSecret = import.meta.env.GITHUB_CLIENT_SECRET;
  const redirectUri = import.meta.env.REDIRECT_URI;

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = cookies.get('decap_oauth_state')?.value;
  cookies.delete('decap_oauth_state', { path: '/api/' });

  if (!code) {
    return htmlPage('authorization:github:error:' + JSON.stringify({ message: 'Codice mancante' }));
  }

  if (!expectedState || !state || state !== expectedState) {
    return htmlPage(
      'authorization:github:error:' + JSON.stringify({ message: 'Verifica dello stato OAuth fallita (possibile CSRF). Riprova il login.' })
    );
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = await tokenRes.json();

    if (data.error || !data.access_token) {
      throw new Error(data.error_description || data.error || 'Token non ricevuto');
    }

    const content = { token: data.access_token, provider: 'github' };
    return htmlPage('authorization:github:success:' + JSON.stringify(content));
  } catch (err) {
    return htmlPage('authorization:github:error:' + JSON.stringify({ message: String((err as Error)?.message || err) }));
  }
}
