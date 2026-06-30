// Funzione serverless su Vercel: /api/auth
// Avvia il login: reindirizza l'utente a GitHub per autorizzare l'app.
export default function handler(_req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end("Configurazione mancante: imposta GITHUB_CLIENT_ID e REDIRECT_URI nelle variabili d'ambiente di Vercel.");
    return;
  }

  const authUrl =
    'https://github.com/login/oauth/authorize' +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    '&scope=repo,user';

  res.statusCode = 302;
  res.setHeader('Location', authUrl);
  res.end();
}
