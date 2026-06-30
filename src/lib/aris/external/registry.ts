import type { ExternalSourceDefinition } from './types';
import { UnifgSource } from './sources/unifg-source';
import { AdisuSource } from './sources/adisu-source';
import { MurSource }   from './sources/mur-source';

const SOURCES: ExternalSourceDefinition[] = [
  UnifgSource,
  AdisuSource,
  MurSource,
];

export function getAllExternalSources(): ExternalSourceDefinition[] {
  return [...SOURCES].sort((a, b) => b.priority - a.priority);
}

export function getExternalSource(id: string): ExternalSourceDefinition | undefined {
  return SOURCES.find(s => s.id === id);
}

export const EXTERNAL_SOURCE_IDS = SOURCES.map(s => s.id);
