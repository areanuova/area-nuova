import type { SourceProvider, NormalizedDocument } from './types';

/**
 * Base per source provider da file Markdown.
 * Implementazioni concrete in scripts/ingest-aris.mjs (Node.js ESM).
 * Questo modulo esporta solo le interfacce TypeScript per il type-checking condiviso.
 */
export abstract class MarkdownSourceProvider implements SourceProvider {
  abstract readonly source: string;
  abstract fetchDocuments(): Promise<NormalizedDocument[]>;

  protected buildContentString(parts: (string | undefined | null)[]): string {
    return parts.filter(Boolean).join('\n');
  }
}

export type { SourceProvider, NormalizedDocument };
