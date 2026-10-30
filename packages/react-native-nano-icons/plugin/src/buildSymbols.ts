import {
  buildAllSymbols as coreBuildAllSymbols,
  checkAllSymbols,
  createQuietLogger,
  detectExpoLogLevel,
} from '../../cli/index';
import { failFrozenPrebuild, frozenScope } from './frozen';
import type { SymbolSetConfig, BuiltSymbolSet } from './types';

// Build all symbol sets.
export async function buildAllSymbols(
  symbolSets: SymbolSetConfig[],
  projectRoot: string,
  frozen?: boolean
): Promise<BuiltSymbolSet[]> {
  const logger = await createQuietLogger(detectExpoLogLevel());
  const scope = frozenScope(frozen);
  if (scope !== 'none') {
    failFrozenPrebuild(
      await checkAllSymbols(symbolSets, projectRoot, {
        existingOnly: scope === 'existing',
      })
    );
  }
  return coreBuildAllSymbols(symbolSets, projectRoot, { logger });
}

// Single build run per process; reused across mods.
let _buildPromise: Promise<BuiltSymbolSet[]> | null = null;

export function getOrBuildSymbols(
  projectRoot: string,
  symbolSets: SymbolSetConfig[],
  frozen?: boolean
): Promise<BuiltSymbolSet[]> {
  if (!_buildPromise) {
    _buildPromise = buildAllSymbols(symbolSets, projectRoot, frozen);
  }
  return _buildPromise;
}
