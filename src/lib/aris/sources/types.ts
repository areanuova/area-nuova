export interface NormalizedDocument {
  source: string;
  source_id: string;
  titolo: string;
  url: string | null;
  contenuto: string;
  metadata: Record<string, unknown>;
  updated_at?: string;
}

export interface SourceProvider {
  readonly source: string;
  fetchDocuments(): Promise<NormalizedDocument[]>;
}
