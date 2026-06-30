import type { Source, Affidabilita } from '../types';
import type { NavigationAction } from '../navigation/types';

export interface ToolResult {
  toolId:               string;
  data:                 string;
  sources:              Source[];
  confidence:           number;           // 0-100
  noLlm?:              boolean;           // true → mai Gemini
  llmReasoningNeeded?: boolean;           // false → mai Gemini; true → chiama sempre Gemini
  actions?:            NavigationAction[]; // copilot navigation actions
}

export interface PlannerResult {
  toolId: string;
  score:  number;
  reason: string;
}

export type { Source, Affidabilita, NavigationAction };
