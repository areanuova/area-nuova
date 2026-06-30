import { registry } from './registry';
import type { ToolResult } from './types';

export async function executeTool(toolId: string, query: string): Promise<ToolResult> {
  const tool = registry.get(toolId);
  return tool.execute(query);
}
