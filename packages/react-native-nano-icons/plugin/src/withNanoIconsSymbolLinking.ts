import { withDangerousMod } from '@expo/config-plugins';
import fs from 'fs';
import path from 'path';
import { copySymbolsetsIntoCatalog } from '../../cli/index.js';
import { getOrBuildSymbols } from './buildSymbols.js';
import type { SymbolSetConfig } from './types.js';

/**
 * Write generated assets into the app's existing ios/<projectName>/Images.xcassets.
 * The Expo prebuild template creates and links that catalog, so no pbxproj
 * changes are needed — actool compiles them and they load by name.
 */
export function withNanoIconsSymbolLinking(
  config: Parameters<typeof withDangerousMod>[0],
  symbolSets: SymbolSetConfig[]
): ReturnType<typeof withDangerousMod> {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const built = await getOrBuildSymbols(
        config.modRequest.projectRoot,
        symbolSets
      );
      if (!built?.length) return config;

      const projectName = config.modRequest.projectName;
      if (!projectName) return config;

      const imagesCatalog = path.join(
        config.modRequest.platformProjectRoot,
        projectName,
        'Images.xcassets'
      );
      if (!fs.existsSync(imagesCatalog)) {
        console.warn(
          `[react-native-nano-icons] ${projectName}/Images.xcassets not found — skipping symbol linking. ` +
            `Run "expo prebuild" first so the catalog exists.`
        );
        return config;
      }

      copySymbolsetsIntoCatalog(imagesCatalog, built);
      return config;
    },
  ]);
}
