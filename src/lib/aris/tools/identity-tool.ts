import { ArisTool } from './base-tool';
import type { ToolResult } from '../agent/types';

const IDENTITY_DATA =
  'Aris è l\'assistente digitale ufficiale di Area Nuova, l\'associazione studentesca ' +
  'dell\'Università di Foggia (UniFg).\n\n' +
  'Aiuta gli studenti a trovare informazioni su:\n' +
  '- Guide universitarie (immatricolazione, Esse3, tasse, certificati, ISEE, Erasmus…)\n' +
  '- Alloggi per studenti a Foggia\n' +
  '- Convenzioni e sconti riservati agli studenti UniFg\n' +
  '- Gruppi WhatsApp dei corsi di laurea\n' +
  '- Borse di studio e servizi ADISU Puglia\n' +
  '- Informazioni ufficiali da UniFg, ADISU e MUR\n' +
  '- Regolamenti e rappresentanti studenteschi\n\n' +
  'Aris usa solo fonti interne e ufficiali — non inventa mai informazioni.';

const PATTERNS: RegExp[] = [
  /\bchi\s+sei\b/i,
  /\bcosa\s+sei\b/i,
  /\bchi\s+[èe]\s+aris\b/i,
  /\bcosa\s+[èe]\s+aris\b/i,
  /\bcosa\s+fa\s+aris\b/i,
  /\ba\s+cosa\s+servi\b/i,
  /\bpresentati\b/i,
  /\bcome\s+funzioni\b/i,
  /\bcosa\s+puoi\s+fare\b/i,
  /\bcosa\s+sai\s+fare\b/i,
  /\bdi\s+cosa\s+ti\s+occupi\b/i,
];

export class IdentityTool extends ArisTool {
  readonly id          = 'identity';
  readonly name        = 'Identità Aris';
  readonly description = 'Chi è Aris, cosa fa, come può aiutare';
  readonly priority    = 90;

  canHandle(query: string): number {
    return this.scorePatterns(PATTERNS, query);
  }

  async execute(_query: string): Promise<ToolResult> {
    return {
      toolId:     this.id,
      data:       IDENTITY_DATA,
      sources:    [],
      confidence: 92,
      noLlm:               true,
      llmReasoningNeeded:  false,
    };
  }
}
