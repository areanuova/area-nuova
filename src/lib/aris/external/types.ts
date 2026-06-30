export interface ExternalPage {
  url: string;
  title: string;
  content: string;
  excerpt: string;
  publishedAt?: string;
  metadata: Record<string, unknown>;
}

export interface ExternalSourceDefinition {
  id: string;
  name: string;
  baseUrl: string;
  allowedPaths: string[];
  deniedPaths: string[];
  priority: number;
  refreshIntervalMinutes: number;
  maxPagesPerSync: number;
  /** Salta verifica TLS per siti con catena certificato incompleta (es. ADISU) */
  allowInsecureTls?: boolean;
  getEntryPoints(): string[];
  parsePage(html: string, url: string): ExternalPage | null;
}

export interface SyncResult {
  sourceId: string;
  sourceName: string;
  pagesChecked: number;
  pagesUpdated: number;
  pagesSkipped: number;
  embeddingsGenerated: number;
  errors: string[];
  startedAt: string;
  completedAt: string;
  status: 'success' | 'partial' | 'failed';
}

export interface FetchResult {
  url: string;
  html: string;
  status: number;
  ok: boolean;
  error?: string;
}

export interface RobotsRules {
  disallowed: string[];
  allowed: string[];
  crawlDelayMs: number;
}
