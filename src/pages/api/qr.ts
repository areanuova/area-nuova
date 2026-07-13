// GET /api/qr?text=... — QR pubblico, SOLO per link WhatsApp dal formato
// valido (chat.whatsapp.com / whatsapp.com/channel). Non è un generatore di
// QR generico: accettare testo arbitrario ne farebbe un proxy QR pubblico
// gratuito, un vettore di abuso non necessario per questa funzione (mostrare
// il QR di un gruppo già pubblico sulla sua pagina).
export const prerender = false;

import type { APIContext } from 'astro';
import QRCode from 'qrcode';
import { isSafeWhatsappLink } from '../../lib/admin/whatsapp';

export const GET = async ({ url }: APIContext): Promise<Response> => {
  const text = url.searchParams.get('text');
  if (!text || !isSafeWhatsappLink(text)) {
    return Response.json({ error: 'invalid_or_unsupported_link' }, { status: 400 });
  }

  try {
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, width: 512 });
    return new Response(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    console.error('[qr] generazione fallita:', (err as Error)?.message ?? err);
    return Response.json({ error: 'generation_failed' }, { status: 500 });
  }
};
