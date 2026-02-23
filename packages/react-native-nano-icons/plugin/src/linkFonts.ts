import {
  IOSConfig,
  withInfoPlist,
  withXcodeProject,
  withDangerousMod,
} from '@expo/config-plugins';
import fs from 'fs/promises';
import path from 'path';
import type { BuiltFont } from './types.js';
type InfoPlist = Record<string, unknown>;

const ANDROID_ASSETS_FONTS_DIR = 'app/src/main/assets/fonts';

const BUILT_FONTS_KEY = '_nanoIconsBuilt' as const;

function getBuiltFonts(config: {
  [key: string]: unknown;
}): BuiltFont[] | undefined {
  return config[BUILT_FONTS_KEY] as BuiltFont[] | undefined;
}

/**
 * Add TTFs to the iOS project (Resources group + UIAppFonts in Info.plist).
 * Reads built font paths from config._nanoIconsBuilt (set by the build mod).
 */
export function withNanoIconsIos(
  config: Parameters<typeof withXcodeProject>[0]
): ReturnType<typeof withXcodeProject> {
  config = withXcodeProject(config, async (config) => {
    const built = getBuiltFonts(
      config as unknown as { [key: string]: unknown }
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
      const built = getBuiltFonts(
        config as unknown as { [key: string]: unknown }
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
 * Copy TTFs to Android assets/fonts. Reads paths from config._nanoIconsBuilt.
 */
export function withNanoIconsAndroid(
  config: Parameters<typeof withDangerousMod>[0]
): ReturnType<typeof withDangerousMod> {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const built = getBuiltFonts(
        config as unknown as { [key: string]: unknown }
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
 * Apply iOS and Android font linking. Built font list is read from config (set by build mod).
 */
export function withNanoIconsFontLinking(
  config: Parameters<typeof withNanoIconsIos>[0]
): ReturnType<typeof withNanoIconsAndroid> {
  config = withNanoIconsIos(config);
  config = withNanoIconsAndroid(config);
  return config;
}
