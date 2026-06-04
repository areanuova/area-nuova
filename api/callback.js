// Funzione serverless su Vercel: /api/callback
// GitHub rimanda qui dopo l'autorizzazione: scambiamo il "code" con un token
// e lo passiamo alla finestra di Decap CMS tramite postMessage.
export default async function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = process.env.REDIRECT_URI;

  const { searchParams } = new URL(req.url, 'http://localhost');
  const code = searchParams.get('code');

  const sendPage = (message) => {
    const payload = JSON.stringify(message); // stringa JS sicura
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
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  };

  if (!code) {
    sendPage('authorization:github:error:' + JSON.stringify({ message: 'Codice mancante' }));
    return;
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
    sendPage('authorization:github:success:' + JSON.stringify(content));
  } catch (err) {
    sendPage('authorization:github:error:' + JSON.stringify({ message: String((err && err.message) || err) }));
  }
}
