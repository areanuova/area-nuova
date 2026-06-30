import type { ToolResult } from '../agent/types';

export abstract class ArisTool {
  abstract readonly id:          string;
  abstract readonly name:        string;
  abstract readonly description: string;
  abstract readonly priority:    number;

  /**
   * Deterministic scoring: returns 0 if this tool cannot handle the query,
   * or 60-99 based on how many patterns match (higher = more relevant).
   */
  abstract canHandle(query: string): number;

  abstract execute(query: string): Promise<ToolResult>;

  protected scorePatterns(patterns: RegExp[], query: string): number {
    const matches = patterns.filter(p => p.test(query)).length;
    if (matches === 0) return 0;
    return Math.min(60 + matches * 10, 95);
  }
}
