export function splitIntoChunks(
  text: string,
  maxSize  = 460,
  overlap  = 46,
): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return [];
  if (normalized.length <= maxSize) return [normalized];

  const paragraphs = normalized.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;

    if (candidate.length <= maxSize) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current.trim());
      // Carry-over overlap
      const words = current.split(' ');
      const overlapWords = words.slice(
        Math.max(0, words.length - Math.ceil(overlap / 5)),
      );
      current = overlapWords.join(' ');
    }

    if (para.length > maxSize) {
      // Sentence-level split for long paragraphs
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        const candidate2 = current ? `${current} ${s}` : s;
        if (candidate2.length <= maxSize) {
          current = candidate2;
        } else {
          if (current) chunks.push(current.trim());
          current = s.slice(0, maxSize);
        }
      }
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((c) => c.length >= 20);
}
