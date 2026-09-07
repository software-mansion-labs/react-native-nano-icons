import {
  buildAllFonts as coreBuildAllFonts,
  createQuietLogger,
  detectExpoLogLevel,
} from '../../cli/index';
import type { IconSetConfig, BuiltFont } from './types';

/**
 * Build TTF + glyphmap for all icon sets.
 * Shows an ora spinner per font set; catches errors and displays a friendly message
 * unless EXPO_DEBUG is set, in which case the full error is re-thrown.
 */
export async function buildAllFonts(
  iconSets: IconSetConfig[],
  projectRoot: string
): Promise<BuiltFont[]> {
  const level = detectExpoLogLevel();
  const logger = await createQuietLogger(level);

  try {
    return await coreBuildAllFonts(iconSets, projectRoot, { logger });
  } catch (err: unknown) {
    logger.fail(err instanceof Error ? err.message : String(err));
    if (level === 'verbose') {
      throw err;
    }
    logger.warn('Run with EXPO_DEBUG=1 for the full error.');
    return [];
  }
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
