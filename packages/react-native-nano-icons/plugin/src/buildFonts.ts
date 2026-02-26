import {
  buildAllFonts as coreBuildAllFonts,
  createQuietLogger,
  detectExpoLogLevel,
} from '../../cli/index.js';
import type { IconSetConfig, BuiltFont } from './types.js';

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
    if (level === 'verbose') {
      throw err;
    }
    logger.fail('Error optimizing icons. Run with EXPO_DEBUG=1 for more logs.');
    return [];
  }
}
