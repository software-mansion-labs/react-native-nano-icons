import fs from 'node:fs';
import path from 'node:path';
import * as plist from 'plist';
import type { PBXNativeTarget, XcodeProject } from 'xcode';
import type { NanoLogger } from './logger';
import type { BuiltFont } from './build';
import { isBuildFontFile, isFontFileOf } from '../src/utils/fontIdentity';

const ANDROID_FONTS_DIR = 'android/app/src/main/assets/fonts';
const IOS_NANOICONS_FONTS_DIR = 'nanoicons-fonts';
const IOS_RUN_SCRIPT_PHASE_NAME = 'Copy nanoicons fonts';
const IOS_APPLICATION_PRODUCT_TYPE = 'com.apple.product-type.application';
const XCODE_PROJECT_DIR_VARIABLE = /\$[({](?:SRCROOT|PROJECT_DIR)[)}]/g;
const SURROUNDING_QUOTES = /^["']|["']$/g;

function getAppTarget(project: XcodeProject): {
  uuid: string;
  target: PBXNativeTarget;
} {
  const appTarget = project.getTarget(IOS_APPLICATION_PRODUCT_TYPE);
  if (appTarget) return appTarget;

  const { uuid, firstTarget } = project.getFirstTarget();
  return { uuid, target: firstTarget };
}

function resolveInfoPlistPaths(
  project: XcodeProject,
  target: PBXNativeTarget,
  iosDir: string,
  fallbackPath: string
): string[] {
  const configurationList =
    project.pbxXCConfigurationList()[target.buildConfigurationList];
  const buildConfigurations = project.pbxXCBuildConfigurationSection();

  const configuredPaths = new Set<string>();

  if (typeof configurationList === 'object') {
    for (const { value } of configurationList.buildConfigurations) {
      const configuration = buildConfigurations[value];
      if (typeof configuration !== 'object') continue;

      const setting = configuration.buildSettings['INFOPLIST_FILE'];
      if (typeof setting !== 'string') continue;

      configuredPaths.add(
        path.resolve(
          iosDir,
          setting
            .replace(SURROUNDING_QUOTES, '')
            .replace(XCODE_PROJECT_DIR_VARIABLE, iosDir)
        )
      );
    }
  }

  const existingPaths = [...configuredPaths].filter((plistPath) =>
    fs.existsSync(plistPath)
  );
  if (existingPaths.length) return existingPaths;

  return fs.existsSync(fallbackPath) ? [fallbackPath] : [];
}

function syncUIAppFonts(
  infoPlistPath: string,
  add: string[],
  remove: string[]
): void {
  const parsed = plist.parse(fs.readFileSync(infoPlistPath, 'utf8')) as Record<
    string,
    unknown
  >;

  const existing = Array.isArray(parsed['UIAppFonts'])
    ? (parsed['UIAppFonts'] as string[])
    : [];
  const fonts = [
    ...new Set([...existing.filter((f) => !remove.includes(f)), ...add]),
  ];
  if (
    fonts.length === existing.length &&
    fonts.every((f, i) => f === existing[i])
  ) {
    return;
  }

  const updated: plist.PlistObject = { ...parsed, UIAppFonts: fonts };
  fs.writeFileSync(infoPlistPath, plist.build(updated), 'utf8');
}

export function syncAndroidFontAssets(
  fontsDir: string,
  staticFonts: BuiltFont[],
  configuredFamilies: string[]
): void {
  const keep = new Set(staticFonts.map((b) => `${b.family}.ttf`));
  if (fs.existsSync(fontsDir)) {
    for (const existing of fs.readdirSync(fontsDir)) {
      if (keep.has(existing)) continue;
      if (
        isBuildFontFile(existing) ||
        configuredFamilies.some((family) => isFontFileOf(family, existing))
      ) {
        fs.unlinkSync(path.join(fontsDir, existing));
      }
    }
  }
  if (!staticFonts.length) return;
  fs.mkdirSync(fontsDir, { recursive: true });
  for (const b of staticFonts) {
    fs.copyFileSync(b.ttfPath, path.join(fontsDir, `${b.family}.ttf`));
  }
}

async function linkAndroid(
  projectRoot: string,
  staticFonts: BuiltFont[],
  builtFonts: BuiltFont[]
): Promise<void> {
  syncAndroidFontAssets(
    path.join(projectRoot, ANDROID_FONTS_DIR),
    staticFonts,
    builtFonts.map((b) => b.fontFamily)
  );
}

async function linkIos(
  projectRoot: string,
  staticFonts: BuiltFont[],
  dynamicFonts: BuiltFont[],
  logger: NanoLogger
): Promise<boolean> {
  const iosDir = path.join(projectRoot, 'ios');

  const xcodeprojDir = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .find((d) => d.name.endsWith('.xcodeproj'));

  if (!xcodeprojDir) {
    logger.warn(`No .xcodeproj found in ${iosDir} — skipping iOS linking.`);
    return false;
  }

  const pbxprojPath = path.join(iosDir, xcodeprojDir.name, 'project.pbxproj');
  if (!fs.existsSync(pbxprojPath)) {
    logger.warn(
      `${path.relative(projectRoot, pbxprojPath)} not found — skipping iOS linking.`
    );
    return false;
  }

  const xcode = require('xcode') as typeof import('xcode');
  const project = xcode.project(pbxprojPath).parseSync();

  const appName = xcodeprojDir.name.replace(/\.xcodeproj$/, '');
  const { uuid: targetUuid, target } = getAppTarget(project);
  const infoPlistPaths = resolveInfoPlistPaths(
    project,
    target,
    iosDir,
    path.join(iosDir, appName, 'Info.plist')
  );

  if (!infoPlistPaths.length) {
    logger.warn(
      `No Info.plist resolved for target "${target.name}" — set INFOPLIST_FILE in its build settings, ` +
        `or place one at ios/${appName}/Info.plist. Skipping iOS linking.`
    );
    return false;
  }

  const fontNames = staticFonts.map((b) => path.basename(b.ttfPath));
  const removedNames = dynamicFonts.map((b) => `${b.fontFamily}.ttf`);
  const iosFontsStaging = path.join(iosDir, IOS_NANOICONS_FONTS_DIR);

  if (fs.existsSync(iosFontsStaging)) {
    for (const existing of fs.readdirSync(iosFontsStaging)) {
      if (existing.endsWith('.ttf') && !fontNames.includes(existing)) {
        fs.unlinkSync(path.join(iosFontsStaging, existing));
        removedNames.push(existing);
      }
    }
  }

  if (staticFonts.length) {
    fs.mkdirSync(iosFontsStaging, { recursive: true });
    for (const b of staticFonts) {
      fs.copyFileSync(
        b.ttfPath,
        path.join(iosFontsStaging, path.basename(b.ttfPath))
      );
    }
  }

  for (const infoPlistPath of infoPlistPaths) {
    syncUIAppFonts(infoPlistPath, fontNames, removedNames);
  }

  if (!staticFonts.length) return true;

  const hasPhase = Object.values(
    project.hash.project.objects['PBXShellScriptBuildPhase'] ?? {}
  ).some(
    (phase) =>
      typeof phase === 'object' &&
      typeof phase['name'] === 'string' &&
      phase['name'].includes(IOS_RUN_SCRIPT_PHASE_NAME)
  );

  if (!hasPhase) {
    const script = `
        NANOICONS_DIR="\\\${PROJECT_DIR}/${IOS_NANOICONS_FONTS_DIR}"
        if [ -d "$NANOICONS_DIR" ]; then
          cp "$NANOICONS_DIR"/*.ttf "\\\${BUILT_PRODUCTS_DIR}/\\\${UNLOCALIZED_RESOURCES_FOLDER_PATH}/" 2>/dev/null || true
        fi
      `;

    project.addBuildPhase(
      [],
      'PBXShellScriptBuildPhase',
      IOS_RUN_SCRIPT_PHASE_NAME,
      targetUuid,
      { shellPath: '/bin/sh', shellScript: script }
    );

    fs.writeFileSync(pbxprojPath, project.writeSync(), 'utf8');
  }

  return true;
}

/**
 * Link built TTFs into native project directories.
 *
 * Handles three cases:
 *  - Both android/ and ios/ exist → link both platforms
 *  - Only one platform dir exists → link that platform only
 *  - Neither exists (e.g. React Native Web) → skip native linking, report output dir
 */
export async function linkBare(
  projectRoot: string,
  builtFonts: BuiltFont[],
  logger: NanoLogger,
  totalSets = builtFonts.length
): Promise<void> {
  if (!builtFonts.length) return;

  const staticFonts = builtFonts.filter((b) => b.linking === 'static');
  const dynamicFonts = builtFonts.filter((b) => b.linking === 'dynamic');

  for (const b of dynamicFonts) {
    const rel = path.relative(projectRoot, b.ttfPath);
    logger.info(
      `${b.fontFamily}: dynamic linking — skipping native bundle. TTF available at ${rel}`
    );
  }

  const hasAndroid = fs.existsSync(path.join(projectRoot, 'android'));
  const hasIos = fs.existsSync(path.join(projectRoot, 'ios'));

  if (!hasAndroid && !hasIos) {
    // React Native Web or other non-native target — just report where fonts landed
    const outputDirs = [
      ...new Set(builtFonts.map((b) => path.dirname(b.ttfPath))),
    ];
    const rel = path.relative(projectRoot, outputDirs[0] ?? '');
    logger.info(
      `No native directories found — fonts saved to ${rel}/  (no native dirs, skipping link)`
    );
    return;
  }

  const linkedPlatforms: string[] = [];

  if (hasAndroid) {
    await linkAndroid(projectRoot, staticFonts, builtFonts);
    linkedPlatforms.push('android');
  }

  if (
    hasIos &&
    (await linkIos(projectRoot, staticFonts, dynamicFonts, logger))
  ) {
    linkedPlatforms.push('ios');
  }

  if (!staticFonts.length) {
    logger.succeed(
      `All ${dynamicFonts.length} font(s) use dynamic linking — nothing to bundle natively.`
    );
    return;
  }

  const dynamicSuffix = dynamicFonts.length
    ? ` (${dynamicFonts.length} dynamic font${
        dynamicFonts.length === 1 ? '' : 's'
      } skipped)`
    : '';

  if (!linkedPlatforms.length) {
    logger.fail(`No platforms linked${dynamicSuffix}.`);
    return;
  }

  logger.succeed(
    `Linked [${staticFonts.map((b) => b.fontFamily).join(', ')}] (${staticFonts.length}/${totalSets}) → ${linkedPlatforms.join(', ')}${dynamicSuffix}`
  );
}
