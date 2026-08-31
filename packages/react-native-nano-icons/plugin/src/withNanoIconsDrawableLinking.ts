import { withDangerousMod } from '@expo/config-plugins';
import path from 'path';
import { copyDrawablesIntoResDir } from '../../cli/index.js';
import { getOrBuildSymbols } from './buildSymbols.js';
import type { SymbolSetConfig } from './types.js';

const ANDROID_DRAWABLES_DIR = 'app/src/main/res/drawable';

/**
 * Copy generated VectorDrawables into the Android app's res/drawable. AGP
 * compiles them automatically and they resolve by name — the native-tab-bar
 * counterpart to the iOS asset catalog, so no gradle changes are needed.
 */
export function withNanoIconsDrawableLinking(
  config: Parameters<typeof withDangerousMod>[0],
  symbolSets: SymbolSetConfig[]
): ReturnType<typeof withDangerousMod> {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const built = await getOrBuildSymbols(
        config.modRequest.projectRoot,
        symbolSets
      );
      if (!built?.length) return config;

      const drawableDir = path.join(
        config.modRequest.platformProjectRoot,
        ANDROID_DRAWABLES_DIR
      );
      copyDrawablesIntoResDir(drawableDir, built);
      return config;
    },
  ]);
}
