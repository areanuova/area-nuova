// GET /api/admin/dashboard/stats — aggregazioni reali per la dashboard
// (Sprint 5.0): conteggi per stato su tutte le collection CMS-gestite,
// gruppi WhatsApp in scadenza/da verificare, contenuti con metadati
// incompleti. Nessun dato inventato: tutto calcolato da getCollection()
// e dalla tabella audit al momento della richiesta.
export const prerender = false;

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { requireAdminUser } from '../../../../lib/admin/auth-server';
import { hasPermission } from '../../../../lib/admin/roles';
import { getAdminSupabase } from '../../../../lib/aris/supabase-admin';
import { isGithubConfigured } from '../../../../lib/admin/github';
import { isVerificaScaduta } from '../../../../lib/admin/whatsapp';
import { isInScadenza } from '../../../../lib/gruppi-whatsapp';
import { withErrorHandling } from '../../../../lib/admin/api-handler';

const GESTITE = ['news', 'guide', 'documenti', 'progetti', 'video', 'gruppi-whatsapp', 'partnership'] as const;
type Stato = 'draft' | 'review' | 'published' | 'archived';

function statoDi(collezione: string, data: any): Stato {
  const campo = collezione === 'progetti' ? data.statoPubblicazione : data.stato;
  return (campo ?? 'published') as Stato;
}

export const GET = withErrorHandling(async ({ request }: APIContext): Promise<Response> => {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: auth.status });
  }

  const conteggiPerStato: Record<string, Record<Stato, number>> = {};
  const contenutiIncompleti: { collezione: string; slug: string; titolo: string; problema: string }[] = [];
  let totalePubblicati = 0, totaleBozze = 0, totaleRevisione = 0, totaleArchiviati = 0;

  for (const collezione of GESTITE) {
    const entries = await getCollection(collezione as any);
    const conteggio: Record<Stato, number> = { draft: 0, review: 0, published: 0, archived: 0 };
    for (const e of entries as any[]) {
      const stato = statoDi(collezione, e.data);
      conteggio[stato] = (conteggio[stato] ?? 0) + 1;
      if (stato === 'published') totalePubblicati++;
      else if (stato === 'draft') totaleBozze++;
      else if (stato === 'review') totaleRevisione++;
      else if (stato === 'archived') totaleArchiviati++;

      const titolo = e.data.titolo ?? e.data.nome ?? e.slug;
      const descrizione = e.data.descrizione ?? e.data.estratto ?? e.data.sottotitolo;
      if (stato !== 'archived' && (!descrizione || String(descrizione).trim() === '')) {
        contenutiIncompleti.push({ collezione, slug: e.slug, titolo, problema: 'Senza descrizione/estratto' });
      }
      if (collezione === 'gruppi-whatsapp' && stato !== 'archived' && !e.data.link) {
        contenutiIncompleti.push({ collezione, slug: e.slug, titolo, problema: 'Senza link WhatsApp' });
      }
    }
    conteggiPerStato[collezione] = conteggio;
  }

  const gruppi = await getCollection('gruppi-whatsapp');
  const gruppiInScadenza = gruppi.filter((g) => statoDi('gruppi-whatsapp', g.data) === 'published' && isInScadenza(g.data as any, 14))
    .map((g) => ({ slug: g.slug, titolo: g.data.titolo, dataScadenza: g.data.dataScadenza }));
  const gruppiDaVerificare = gruppi.filter((g) => statoDi('gruppi-whatsapp', g.data) === 'published' && isVerificaScaduta(g.data.linkVerificatoIl))
    .map((g) => ({ slug: g.slug, titolo: g.data.titolo, linkVerificatoIl: g.data.linkVerificatoIl ?? null }));

  let utentiAttivi = 0, utentiTotali = 0;
  if (hasPermission(auth.user.role, 'users.manage')) {
    const sb = getAdminSupabase();
    const { data } = await sb.from('admin_users').select('attivo');
    utentiTotali = data?.length ?? 0;
    utentiAttivi = data?.filter((u: any) => u.attivo).length ?? 0;
  }

  return Response.json({
    riepilogo: { totalePubblicati, totaleBozze, totaleRevisione, totaleArchiviati },
    conteggiPerStato,
    gruppiInScadenza,
    gruppiDaVerificare,
    contenutiIncompleti: contenutiIncompleti.slice(0, 20),
    contenutiIncompletiTotale: contenutiIncompleti.length,
    githubConfigurato: isGithubConfigured(),
    utenti: { attivi: utentiAttivi, totali: utentiTotali },
  });
});
