// Validazione del formato dei link WhatsApp (Sprint 5.0) e generazione QR.
// Solo validazione di FORMATO: nessuna chiamata HTTP al link (niente
// scraping, niente verifica che il gruppo sia ancora raggiungibile — non
// richiesto, esplicitamente vietato dal mandato). La "verifica" reale
// resta un'azione manuale dell'admin, registrata in `linkVerificatoIl`.

export type WhatsappLinkStatus = 'valid_format' | 'invalid_format' | 'empty';

const CHAT_INVITE_RE = /^https:\/\/chat\.whatsapp\.com\/(?:invite\/)?[A-Za-z0-9]{10,}(?:\?.*)?$/;
const CHANNEL_RE = /^https:\/\/(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]{10,}(?:\?.*)?$/;
// youtu.be-style short links con parametri di tracciamento (es. ?mode=...,
// ?si=...) sono ammessi da entrambe le regex sopra grazie al `(?:\?.*)?`.

export function classifyWhatsappLink(raw: string | null | undefined): WhatsappLinkStatus {
  const value = raw?.trim();
  if (!value) return 'empty';
  if (CHAT_INVITE_RE.test(value) || CHANNEL_RE.test(value)) return 'valid_format';
  return 'invalid_format';
}

export function isSafeWhatsappLink(raw: string | null | undefined): boolean {
  return classifyWhatsappLink(raw) === 'valid_format';
}

/** true se il link non è più stato marcato come verificato da oltre `giorni` giorni (o mai). */
export function isVerificaScaduta(linkVerificatoIl: Date | string | undefined | null, giorni = 90): boolean {
  if (!linkVerificatoIl) return true;
  const data = typeof linkVerificatoIl === 'string' ? new Date(linkVerificatoIl) : linkVerificatoIl;
  if (Number.isNaN(data.getTime())) return true;
  const soglia = Date.now() - giorni * 24 * 60 * 60 * 1000;
  return data.getTime() < soglia;
}
