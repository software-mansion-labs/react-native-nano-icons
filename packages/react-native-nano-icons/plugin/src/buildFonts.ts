import {
  buildAllFonts as coreBuildAllFonts,
  createQuietLogger,
  detectExpoLogLevel,
} from '../../cli/index';
import type { IconSetConfig, BuiltFont } from './types';

/**
 * Build TTF + glyphmap for all icon sets.
 * Reports every broken icon, then fails the prebuild so no set is silently left unlinked.
 * EXPO_DEBUG adds the per-file processing details.
 */
export async function buildAllFonts(
  iconSets: IconSetConfig[],
  projectRoot: string
): Promise<BuiltFont[]> {
  const logger = await createQuietLogger(detectExpoLogLevel());
  return coreBuildAllFonts(iconSets, projectRoot, { logger });
}

// Single build run per process; reused across ios/android mods.
let _buildPromise: Promise<BuiltFont[]> | null = null;

export function getOrBuildFonts(
  projectRoot: string,
  iconSets: IconSetConfig[]
): Promise<BuiltFont[]> {
  if (!_buildPromise) {
    _buildPromise = buildAllFonts(iconSets, projectRoot);
  }
  return _buildPromise;
}
