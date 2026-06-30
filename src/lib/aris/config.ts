export const ARIS_CONFIG = {
  // Chunking
  chunkSize:    460,
  chunkOverlap: 46,

  // Retrieval
  maxChunks:           6,
  similarityThreshold: 0.40,

  // Input limits
  maxInputLength:     1_000,
  maxHistoryMessages: 10,

  // Rate limiting (requests / windowMs)
  rateLimit: {
    chat:     { requests: 15, windowMs: 5 * 60 * 1_000 },
    search:   { requests: 60, windowMs: 5 * 60 * 1_000 },
    index:    { requests: 5,  windowMs: 60 * 1_000       },
    feedback: { requests: 20, windowMs: 5 * 60 * 1_000 },
  },
} as const;
