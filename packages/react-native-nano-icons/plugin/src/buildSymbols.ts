import {
  buildAllSymbols as coreBuildAllSymbols,
  createQuietLogger,
  detectExpoLogLevel,
} from '../../cli/index.js';
import type { SymbolSetConfig, BuiltSymbolSet } from './types.js';

// Build all symbol sets. Shows a friendly message on error unless EXPO_DEBUG is set.
export async function buildAllSymbols(
  symbolSets: SymbolSetConfig[],
  projectRoot: string
): Promise<BuiltSymbolSet[]> {
  const level = detectExpoLogLevel();
  const logger = await createQuietLogger(level);

  try {
    return await coreBuildAllSymbols(symbolSets, projectRoot, { logger });
  } catch (err: unknown) {
    if (level === 'verbose') {
      throw err;
    }
    logger.fail('Error building symbols. Run with EXPO_DEBUG=1 for more logs.');
    return [];
  }
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
