import type { ArisTool } from '../tools/base-tool';

const _tools = new Map<string, ArisTool>();

export const registry = {
  register(tool: ArisTool): void {
    _tools.set(tool.id, tool);
  },

  get(id: string): ArisTool {
    const t = _tools.get(id);
    if (!t) throw new Error(`[ArisRegistry] Tool sconosciuto: "${id}"`);
    return t;
  },

  getAll(): ArisTool[] {
    return [..._tools.values()].sort((a, b) => b.priority - a.priority);
  },

  size(): number {
    return _tools.size;
  },
};
