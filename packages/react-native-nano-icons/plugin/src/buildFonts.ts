import {
  buildAllFonts as coreBuildAllFonts,
  checkAllFonts,
  createQuietLogger,
  detectExpoLogLevel,
} from '../../cli/index';
import { failFrozenPrebuild, frozenScope } from './frozen';
import type { IconSetConfig, BuiltFont } from './types';

/**
 * Build TTF + glyphmap for all icon sets.
 * Reports every broken icon, then fails the prebuild so no set is silently left unlinked.
 * When frozen, fails the prebuild instead when a set is out of date, and builds nothing.
 * EXPO_DEBUG adds the per-file processing details.
 */
export async function buildAllFonts(
  iconSets: IconSetConfig[],
  projectRoot: string,
  frozen?: boolean
): Promise<BuiltFont[]> {
  const logger = await createQuietLogger(detectExpoLogLevel());
  const scope = frozenScope(frozen);
  if (scope !== 'none') {
    failFrozenPrebuild(
      await checkAllFonts(iconSets, projectRoot, {
        existingOnly: scope === 'existing',
      })
    );
  }
  return coreBuildAllFonts(iconSets, projectRoot, { logger });
}

// Single build run per process; reused across ios/android mods.
let _buildPromise: Promise<BuiltFont[]> | null = null;

export function getOrBuildFonts(
  projectRoot: string,
  iconSets: IconSetConfig[],
  frozen?: boolean
): Promise<BuiltFont[]> {
  if (!_buildPromise) {
    _buildPromise = buildAllFonts(iconSets, projectRoot, frozen);
  }
  return _buildPromise;
}
