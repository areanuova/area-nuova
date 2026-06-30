import { GoogleGenAI } from '@google/genai';
import type { AIProvider, CompletionParams } from './types';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private ai: GoogleGenAI;
  private chatModel: string;

  constructor(apiKey: string, chatModel?: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.chatModel = chatModel ?? 'gemini-2.0-flash';
  }

  // Embeddings non supportati con Gemini: dimensione 768 ≠ 1536 in uso su Supabase.
  // Il RagTool fallirà con questo errore; i tool strutturati non chiamano generateEmbedding.
  async generateEmbedding(_text: string): Promise<number[]> {
    throw new Error(
      '[Aris] GeminiProvider non supporta gli embedding (text-embedding-004 = 768 dim vs ' +
      'vector(1536) su Supabase). Per la ricerca semantica (RagTool) imposta AI_PROVIDER=openai.',
    );
  }

  async generateCompletion(params: CompletionParams): Promise<string> {
    const contents = this.toContents(params);
    const response = await this.ai.models.generateContent({
      model:    params.model ?? this.chatModel,
      contents,
      config: {
        systemInstruction: params.systemPrompt,
        temperature:       params.temperature    ?? 0.1,
        maxOutputTokens:   params.maxTokens      ?? 900,
      },
    });
    return response.text ?? '';
  }

  async *streamCompletion(params: CompletionParams): AsyncIterable<string> {
    const contents = this.toContents(params);
    const stream   = await this.ai.models.generateContentStream({
      model:    params.model ?? this.chatModel,
      contents,
      config: {
        systemInstruction: params.systemPrompt,
        temperature:       params.temperature   ?? 0.1,
        maxOutputTokens:   params.maxTokens     ?? 900,
      },
    });
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }

  // Converte ChatMessage[] nel formato Content[] di Gemini.
  // Gemini usa role 'model' invece di 'assistant' e non ammette messaggi consecutivi
  // dello stesso ruolo: se il primo messaggio non è 'user', viene scartato.
  private toContents(params: CompletionParams) {
    const contents = params.messages.map((m) => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    // Gemini richiede che il primo turno sia 'user'
    while (contents.length > 0 && contents[0].role !== 'user') {
      contents.shift();
    }
    return contents;
  }
}
