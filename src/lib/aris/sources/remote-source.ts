/**
 * RemoteSource — placeholder per il crawling di fonti esterne.
 *
 * Fonti future pianificate:
 *   - unifg.it (bandi, avvisi, regolamenti)
 *   - adisupuglia.it (borse di studio, alloggi DSU)
 *   - esse3.unifg.it (calendario esami, sessioni)
 *
 * Per aggiungere una fonte:
 * 1. Implementa `fetchDocuments()` che scarica e parsa le pagine target
 * 2. Chiama `indexDocument()` in scripts/ingest-aris.mjs con source = 'unifg' (o simile)
 * 3. Aggiungi il source alla whitelist in src/lib/aris/router.ts
 *
 * Nota: evita il crawling eccessivo — rispetta i robots.txt e le condizioni d'uso.
 */

import type { SourceProvider, NormalizedDocument } from './types';

export class RemoteSource implements SourceProvider {
  constructor(
    readonly source: string,
    private readonly baseUrl: string,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async fetchDocuments(): Promise<NormalizedDocument[]> {
    throw new Error(
      `RemoteSource per "${this.source}" (${this.baseUrl}) non è ancora implementato.`,
    );
  }
}
