import { runAgent } from './agent/agent';
import type { ChatMessage } from './types';

export interface ArisChatParams {
  message:  string;
  history:  ChatMessage[];
  context?: string; // personalization context (corso, anno, etc.)
}

export async function streamArisResponse(
  { message, history, context }: ArisChatParams,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
  return runAgent(message, history, controller, context);
}
