// Normalizzazione ID video YouTube, server-side, pura (nessuna dipendenza
// Astro). Accetta i tre formati ammessi nel frontmatter di `youtubeId`
// (ID nudo, URL completo youtube.com/watch, URL breve youtu.be) e restituisce
// sempre e solo un ID pulito o null — mai un valore non validato usato
// direttamente in un iframe.

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function extractYoutubeId(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;

  if (YOUTUBE_ID_PATTERN.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v');
      return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
    }
    const embedMatch = url.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/);
    if (embedMatch && YOUTUBE_ID_PATTERN.test(embedMatch[2])) return embedMatch[2];
  }

  return null;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
