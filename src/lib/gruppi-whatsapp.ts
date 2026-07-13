// Helper puri condivisi tra le pagine pubbliche dei gruppi WhatsApp
// (Sprint 5.0): un gruppo pubblicato ma scaduto non deve comparire, un
// gruppo aperto da pochi giorni è "Nuovo", uno che scade a breve è "In
// scadenza". Nessuna dipendenza da astro:content: riceve solo `data`.
export interface GruppoWhatsappData {
  stato: string;
  dataScadenza?: Date;
  dataApertura?: Date;
  inEvidenza?: boolean;
}

export function isGruppoVisibilePubblicamente(data: GruppoWhatsappData): boolean {
  if (data.stato !== 'published') return false;
  if (data.dataScadenza && data.dataScadenza.getTime() < Date.now()) return false;
  return true;
}

export function isNuovo(data: GruppoWhatsappData, giorni = 14): boolean {
  if (!data.dataApertura) return false;
  const soglia = Date.now() - giorni * 24 * 60 * 60 * 1000;
  return data.dataApertura.getTime() >= soglia;
}

export function isInScadenza(data: GruppoWhatsappData, giorni = 14): boolean {
  if (!data.dataScadenza) return false;
  const restante = data.dataScadenza.getTime() - Date.now();
  return restante > 0 && restante <= giorni * 24 * 60 * 60 * 1000;
}
