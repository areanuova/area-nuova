import { getAIProvider } from './ai/provider';

export async function generateEmbedding(text: string): Promise<number[]> {
  return getAIProvider().generateEmbedding(text);
}
