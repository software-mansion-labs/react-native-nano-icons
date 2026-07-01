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
const IOS_FONTS_GROUP = 'Resources';

/**
 * Add TTFs to the iOS project (Resources group + UIAppFonts in Info.plist).
 *
 * Copies each .ttf into ios/<projectName>/Resources/ on every prebuild so that
 * Xcode's incremental build reliably picks up updated glyph data. Referencing
 * the .ttf via a relative path outside ios/ leaves stale fonts in the .app
 * bundle when only the file contents change.
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
    const bundled = built?.filter((b) => b.linking !== 'dynamic') ?? [];
    if (!bundled.length) return config;
    const project = config.modResults;
    const platformProjectRoot = config.modRequest.platformProjectRoot;
    const projectName =
      config.modRequest.projectName ??
      IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    const fontsDir = path.join(
      platformProjectRoot,
      projectName,
      IOS_FONTS_GROUP
    );
    await fs.mkdir(fontsDir, { recursive: true });
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, IOS_FONTS_GROUP);
    for (const { ttfPath } of bundled) {
      const dest = path.join(fontsDir, path.basename(ttfPath));
      await fs.copyFile(ttfPath, dest);
      const relativePath = path.relative(platformProjectRoot, dest);
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: relativePath,
        groupName: IOS_FONTS_GROUP,
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
      const bundled = built?.filter((b) => b.linking !== 'dynamic') ?? [];
      if (!bundled.length) return config;
      const ttfPaths = bundled.map((b) => b.ttfPath);
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
      const bundled = built?.filter((b) => b.linking !== 'dynamic') ?? [];
      if (!bundled.length) return config;
      const fontsDir = path.join(
        config.modRequest.platformProjectRoot,
        ANDROID_ASSETS_FONTS_DIR
      );
      await fs.mkdir(fontsDir, { recursive: true });
      for (const b of bundled) {
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
