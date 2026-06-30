import { createHash } from 'node:crypto';

export function computeHash(content: string): string {
  return createHash('sha256').update(content.normalize('NFC').trim()).digest('hex');
}
