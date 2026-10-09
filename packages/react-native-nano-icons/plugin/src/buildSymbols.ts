import {
  buildAllSymbols as coreBuildAllSymbols,
  createQuietLogger,
  detectExpoLogLevel,
} from '../../cli/index';
import type { SymbolSetConfig, BuiltSymbolSet } from './types';

// Build all symbol sets.
export async function buildAllSymbols(
  symbolSets: SymbolSetConfig[],
  projectRoot: string
): Promise<BuiltSymbolSet[]> {
  const logger = await createQuietLogger(detectExpoLogLevel());
  return coreBuildAllSymbols(symbolSets, projectRoot, { logger });
}

// Single build run per process; reused across mods.
let _buildPromise: Promise<BuiltSymbolSet[]> | null = null;

export function getOrBuildSymbols(
  projectRoot: string,
  symbolSets: SymbolSetConfig[]
): Promise<BuiltSymbolSet[]> {
  if (!_buildPromise) {
    _buildPromise = buildAllSymbols(symbolSets, projectRoot);
  }
  return _buildPromise;
}
