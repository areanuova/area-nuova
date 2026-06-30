export interface ArisDocument {
  id?: string;
  source: string;
  source_id: string;
  titolo: string;
  url: string | null;
  contenuto: string;
  metadata: Record<string, unknown>;
}

export interface RetrievedChunk {
  document_id: string;
  titolo: string;
  url: string | null;
  source: string;
  chunk_text: string;
  similarity: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Source {
  titolo: string;
  url: string | null;
  source: string;
}

export type Affidabilita = 'alta' | 'media' | 'non_trovata';

export interface NavigationAction {
  type:     'navigate' | 'open-filter' | 'open-page' | 'external-link' | 'scroll' | 'copy' | 'search';
  label:    string;
  url?:     string;
  filters?: Record<string, string>;
  query?:   string;
  value?:   string;
}

export interface StreamEvent {
  type: 'chunk' | 'meta' | 'error';
  content?: string;
  sources?: Source[];
  affidabilita?: Affidabilita;
  message?: string;
  actions?: NavigationAction[];
  tool?: string;
  confidence?: number;
}
