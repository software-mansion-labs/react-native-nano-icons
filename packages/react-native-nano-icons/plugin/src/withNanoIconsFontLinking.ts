import {
  IOSConfig,
  withInfoPlist,
  withXcodeProject,
  withDangerousMod,
} from '@expo/config-plugins';
import type { InfoPlist } from '@expo/config-plugins';
import fs from 'fs/promises';
import path from 'path';
import { getOrBuildFonts } from './buildFonts.js';
import type { IconSetConfig } from './types.js';

const ANDROID_ASSETS_FONTS_DIR = 'app/src/main/assets/fonts';

/**
 * Add TTFs to the iOS project (Resources group + UIAppFonts in Info.plist).
 */
export function withNanoIconsIos(
  config: Parameters<typeof withXcodeProject>[0],
  iconSets: IconSetConfig[]
): ReturnType<typeof withXcodeProject> {
  config = withXcodeProject(config, async (config) => {
    const built = await getOrBuildFonts(
      config.modRequest.projectRoot,
      iconSets
    );
    if (!built?.length) return config;
    const ttfPaths = built.map((b) => b.ttfPath);
    const project = config.modResults;
    const platformProjectRoot = config.modRequest.platformProjectRoot;
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, 'Resources');
    for (const fontPath of ttfPaths) {
      const relativePath = path.relative(platformProjectRoot, fontPath);
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: relativePath,
        groupName: 'Resources',
        project,
        isBuildFile: true,
        verbose: true,
      });
    }
    return config;
  });

  config = withInfoPlist(
    config as Parameters<typeof withInfoPlist>[0],
    async (config) => {
      const built = await getOrBuildFonts(
        config.modRequest.projectRoot,
        iconSets
      );
      if (!built?.length) return config;
      const ttfPaths = built.map((b) => b.ttfPath);
      const existingFonts = getUIAppFonts(config.modResults);
      const fontList = ttfPaths.map((f) => path.basename(f));
      const allFonts = [...existingFonts, ...fontList];
      config.modResults.UIAppFonts = Array.from(new Set(allFonts));
      return config;
    }
  );

  return config;
}

function getUIAppFonts(infoPlist: InfoPlist): string[] {
  const fonts = infoPlist['UIAppFonts'];
  if (
    fonts != null &&
    Array.isArray(fonts) &&
    fonts.every((font) => typeof font === 'string')
  ) {
    return fonts as string[];
  }
  return [];
}

/**
 * Copy TTFs to Android assets/fonts.
 */
export function withNanoIconsAndroid(
  config: Parameters<typeof withDangerousMod>[0],
  iconSets: IconSetConfig[]
): ReturnType<typeof withDangerousMod> {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const built = await getOrBuildFonts(
        config.modRequest.projectRoot,
        iconSets
      );
      if (!built?.length) return config;
      const fontsDir = path.join(
        config.modRequest.platformProjectRoot,
        ANDROID_ASSETS_FONTS_DIR
      );
      await fs.mkdir(fontsDir, { recursive: true });
      for (const b of built) {
        const filename = path.basename(b.ttfPath);
        const dest = path.join(fontsDir, filename);
        await fs.copyFile(b.ttfPath, dest);
      }
      return config;
    },
  ]);
}

/**
 * Apply iOS and Android font linking.
 */
export function withNanoIconsFontLinking(
  config: Parameters<typeof withNanoIconsIos>[0],
  iconSets: IconSetConfig[]
): ReturnType<typeof withNanoIconsAndroid> {
  config = withNanoIconsIos(config, iconSets);
  config = withNanoIconsAndroid(config, iconSets);
  return config;
}
