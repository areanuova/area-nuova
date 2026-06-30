import type { AIProvider, CompletionParams } from './types';

function isQuotaError(msg: string): boolean {
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('rate limit')
  );
}

export class FallbackProvider implements AIProvider {
  readonly name = 'fallback';

  constructor(
    private primary:  AIProvider,
    private fallback: AIProvider,
  ) {}

  async generateEmbedding(text: string): Promise<number[]> {
    return this.primary.generateEmbedding(text);
  }

  async generateCompletion(params: CompletionParams): Promise<string> {
    try {
      return await this.primary.generateCompletion(params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isQuotaError(msg)) throw err;
      console.warn('[FallbackProvider] Primary quota exceeded — using fallback');
      return this.fallback.generateCompletion(params);
    }
  }

  async *streamCompletion(params: CompletionParams): AsyncIterable<string> {
    try {
      const chunks: string[] = [];
      for await (const chunk of this.primary.streamCompletion(params)) {
        chunks.push(chunk);
        yield chunk;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isQuotaError(msg)) throw err;
      console.warn('[FallbackProvider] Primary stream quota — switching to fallback');
      yield* this.fallback.streamCompletion(params);
    }
  }
}
