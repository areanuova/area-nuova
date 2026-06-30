export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompletionParams {
  systemPrompt: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface AIProvider {
  readonly name: string;
  generateEmbedding(text: string): Promise<number[]>;
  generateCompletion(params: CompletionParams): Promise<string>;
  streamCompletion(params: CompletionParams): AsyncIterable<string>;
}
