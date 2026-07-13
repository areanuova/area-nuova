// Helper per il segnale 'admin:ready' (Sprint 3.1). Il contenuto protetto del
// pannello è ora montato nel DOM solo dopo il boot in AdminLayout.astro (vedi
// commento lì per il perché), quindi lo script di una pagina figlia potrebbe
// iniziare a eseguire DOPO che l'evento è già stato dispatchato — un semplice
// addEventListener rischierebbe di perdere l'evento. AdminLayout salva sempre
// l'ultimo dettaglio in window.__adminReadyDetail__ prima di dispatchare:
// onAdminReady lo controlla subito, e si mette in ascolto solo se assente.
import type { AdminUser } from './roles';

export interface AdminReadyDetail {
  user: AdminUser;
  accessToken: string | null;
}

export function onAdminReady(callback: (detail: AdminReadyDetail) => void): void {
  const existing = (window as any).__adminReadyDetail__ as AdminReadyDetail | undefined;
  if (existing) {
    callback(existing);
    return;
  }
  document.addEventListener(
    'admin:ready',
    (e: Event) => callback((e as CustomEvent).detail),
    { once: true },
  );
}
