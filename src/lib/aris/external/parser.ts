const BLOCK_TAGS_RE =
  /<(script|style|nav|header|footer|aside|form|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi;

const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;':  '&',
  '&lt;':   '<',
  '&gt;':   '>',
  '&quot;': '"',
  '&#39;':  "'",
  '&nbsp;': ' ',
  '&egrave;': 'è',
  '&eacute;': 'é',
  '&agrave;': 'à',
  '&ugrave;': 'ù',
  '&igrave;': 'ì',
  '&ograve;': 'ò',
};

export function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return decodeHtmlEntities(og[1]).trim();

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title) return decodeHtmlEntities(title[1]).replace(/\s*[|\-–—].*$/, '').trim();

  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1) return decodeHtmlEntities(h1[1]).trim();

  return '';
}

export function htmlToText(html: string): string {
  return html
    .replace(BLOCK_TAGS_RE, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z]+;/g, s => HTML_ENTITY_MAP[s] ?? ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractExcerpt(text: string, maxLength = 300): string {
  const clean = text.replace(/\n+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  return cut.replace(/\s+\S*$/, '') + '…';
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const base    = new URL(baseUrl);
  const links   = new Set<string>();
  const pattern = /href=["']([^"'#?][^"']*?)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    try {
      const u = new URL(match[1], baseUrl);
      if (u.hostname === base.hostname && u.protocol === base.protocol) {
        u.hash   = '';
        u.search = '';
        links.add(u.href);
      }
    } catch { /* invalid URL */ }
  }

  return [...links];
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&[a-zA-Z]+;/g, s => HTML_ENTITY_MAP[s] ?? s);
}
