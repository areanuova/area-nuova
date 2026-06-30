import { getAdminSupabase } from '../supabase-admin';

interface Alloggio {
  id: string;
  titolo: string;
  tipo: string;
  citta: string;
  zona: string | null;
  prezzo: number;
  spese_incluse: boolean;
  disponibile_da: string | null;
  descrizione: string;
  inserzionista_nome: string;
  inserzionista_email: string;
  inserzionista_telefono: string | null;
}

/**
 * Recupera in tempo reale gli alloggi disponibili dal database Supabase.
 * Usato dal router quando Aris riceve domande su alloggi/case/affitti.
 */
export async function getLiveAlloggiContext(): Promise<string> {
  try {
    const sb = getAdminSupabase();
    const oggi = new Date().toISOString().split('T')[0];

    const { data, error } = await sb
      .from('alloggi')
      .select(
        'id, titolo, tipo, citta, zona, prezzo, spese_incluse, disponibile_da, descrizione, inserzionista_nome, inserzionista_email, inserzionista_telefono',
      )
      .eq('stato', 'pubblicato')
      .gte('scade_il', oggi)
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) {
      console.error('[Aris alloggi-source]', error.message);
      return '';
    }

    if (!data || data.length === 0) {
      return 'Al momento non ci sono alloggi disponibili nella piattaforma di Area Nuova.';
    }

    const lista = (data as Alloggio[]).map((a) => {
      const prezzo = `€${a.prezzo}/mese${a.spese_incluse ? ' (spese incluse)' : ' (spese escluse)'}`;
      const disp   = a.disponibile_da ? `disponibile dal ${a.disponibile_da}` : 'disponibile subito';
      const zona   = a.zona ? ` — zona: ${a.zona}` : '';
      const tel    = a.inserzionista_telefono ? ` | Tel: ${a.inserzionista_telefono}` : '';

      return [
        `• ${a.titolo}`,
        `  Tipo: ${a.tipo} | Città: ${a.citta}${zona}`,
        `  Prezzo: ${prezzo} | ${disp}`,
        `  Contatto: ${a.inserzionista_nome} — ${a.inserzionista_email}${tel}`,
        `  Descrizione: ${a.descrizione.slice(0, 180)}${a.descrizione.length > 180 ? '…' : ''}`,
        `  Link: /alloggi/${a.id}`,
      ].join('\n');
    });

    return `Alloggi disponibili sul portale Area Nuova (aggiornati ora):\n\n${lista.join('\n\n')}`;
  } catch (err) {
    console.error('[Aris alloggi-source] eccezione:', err);
    return '';
  }
}
