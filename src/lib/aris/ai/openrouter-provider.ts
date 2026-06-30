import type { AIProvider, CompletionParams } from './types';

export class OpenRouterProvider implements AIProvider {
  readonly name = 'openrouter';
  private apiKey: string;
  private model:  string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model  = model ?? 'mistralai/mistral-7b-instruct:free';
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    throw new Error('[Aris] OpenRouterProvider non supporta gli embedding.');
  }

  async generateCompletion(params: CompletionParams): Promise<string> {
    const body = this.buildBody(params, false);
    const res  = await this.call(body);
    const json = await res.json() as { choices: Array<{ message: { content: string } }> };
    return json.choices?.[0]?.message?.content ?? '';
  }

  async *streamCompletion(params: CompletionParams): AsyncIterable<string> {
    const body   = this.buildBody(params, true);
    const res    = await this.call(body);
    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer    = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const chunk = JSON.parse(data) as { choices: Array<{ delta: { content?: string } }> };
          const text  = chunk.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch { /* malformed chunk */ }
      }
    }
  }

  private buildBody(params: CompletionParams, stream: boolean): object {
    return {
      model:       params.model ?? this.model,
      stream,
      temperature: params.temperature ?? 0.1,
      max_tokens:  params.maxTokens   ?? 900,
      messages: [
        { role: 'system', content: params.systemPrompt },
        ...params.messages.map(m => ({ role: m.role, content: m.content })),
      ],
    };
  }

  private async call(body: object): Promise<Response> {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'https://areanuova.it',
        'X-Title':       'Aris — Area Nuova',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`[OpenRouter] ${res.status}: ${err}`);
    }

    return res;
  }
}
