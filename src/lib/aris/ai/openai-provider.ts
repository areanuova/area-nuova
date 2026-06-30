import OpenAI from 'openai';
import type { AIProvider, CompletionParams } from './types';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private embeddingModel: string;
  private chatModel: string;

  constructor(apiKey: string, embeddingModel?: string, chatModel?: string) {
    this.client = new OpenAI({ apiKey });
    this.embeddingModel = embeddingModel ?? 'text-embedding-3-small';
    this.chatModel = chatModel ?? 'gpt-4o';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const res = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text.replace(/\n+/g, ' ').slice(0, 8_000),
    });
    return res.data[0].embedding;
  }

  async generateCompletion(params: CompletionParams): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: params.model ?? this.chatModel,
      temperature: params.temperature ?? 0.1,
      max_tokens: params.maxTokens ?? 900,
      messages: [
        { role: 'system', content: params.systemPrompt },
        ...params.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    return res.choices[0]?.message?.content ?? '';
  }

  async *streamCompletion(params: CompletionParams): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: params.model ?? this.chatModel,
      temperature: params.temperature ?? 0.1,
      max_tokens: params.maxTokens ?? 900,
      stream: true,
      messages: [
        { role: 'system', content: params.systemPrompt },
        ...params.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? '';
      if (content) yield content;
    }
  }
}
