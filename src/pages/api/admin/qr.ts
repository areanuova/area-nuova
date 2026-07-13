// GET /api/admin/qr?text=...&format=svg|png — genera un QR code dal testo
// (tipicamente un link WhatsApp) al volo, lato server. Nessun dato salvato:
// il QR è deterministico dal contenuto del link, rigenerabile in ogni
// momento — coerente con "verifica che il QR punti allo stesso link del
// gruppo" (Sprint 5.0): non c'è mai un QR "vecchio" scollegato dal link
// reale, a meno che l'admin non carichi esplicitamente un'immagine custom
// (campo `qrCode`, gestito come qualunque altro percorso immagine passthrough).
export const prerender = false;

import type { APIContext } from 'astro';
import QRCode from 'qrcode';
import { requireAdminUser } from '../../../lib/admin/auth-server';
import { withErrorHandling } from '../../../lib/admin/api-handler';

export const GET = withErrorHandling(async ({ request, url }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }

  const text = url.searchParams.get('text');
  const format = url.searchParams.get('format') === 'png' ? 'png' : 'svg';
  if (!text || text.length > 2000) {
    return Response.json({ error: 'invalid_text' }, { status: 400 });
  }

  if (format === 'svg') {
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, width: 512 });
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
  }

  const buffer = await QRCode.toBuffer(text, { type: 'png', margin: 1, width: 512 });
  return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
});
