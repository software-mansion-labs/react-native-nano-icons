import fs from 'node:fs';
import path from 'node:path';
import * as plist from 'plist';
import type { NanoLogger } from './logger.js';
import type { BuiltFont } from './build.js';

type ShellScriptOptions = {
  shellPath?: string;
  shellScript: string;
  inputPaths?: string[];
  outputPaths?: string[];
};

type XcodeProject = {
  parseSync: () => XcodeProject;
  getFirstTarget: () => { uuid: string };
  addBuildPhase: (
    filePaths: string[],
    phaseType: string,
    comment: string,
    target: string,
    options?: ShellScriptOptions
  ) => void;
  writeSync: () => string;
  hash: {
    project: {
      objects: Record<
        string,
        Record<string, { name?: string; shellScript?: string }>
      >;
    };
  };
};

const ANDROID_FONTS_DIR = 'android/app/src/main/assets/fonts';
const IOS_NANOICONS_FONTS_DIR = 'nanoicons-fonts';
const IOS_RUN_SCRIPT_PHASE_NAME = 'Copy nanoicons fonts';

function copyAndroidFonts(projectRoot: string, builtFonts: BuiltFont[]): void {
  const androidFontsPath = path.join(projectRoot, ANDROID_FONTS_DIR);
  fs.mkdirSync(androidFontsPath, { recursive: true });

  for (const b of builtFonts) {
    const dest = path.join(androidFontsPath, path.basename(b.ttfPath));
    fs.copyFileSync(b.ttfPath, dest);
  }
}

/** Copy TTFs into ios/nanoicons-fonts; the build phase picks them up from there. */
function stageIosFonts(projectRoot: string, builtFonts: BuiltFont[]): string[] {
  const iosFontsStaging = path.join(
    projectRoot,
    'ios',
    IOS_NANOICONS_FONTS_DIR
  );
  fs.mkdirSync(iosFontsStaging, { recursive: true });

  const fontNames: string[] = [];
  for (const b of builtFonts) {
    const name = path.basename(b.ttfPath);
    fontNames.push(name);
    fs.copyFileSync(b.ttfPath, path.join(iosFontsStaging, name));
  }
  return fontNames;
}

/**
 * Xcode Run Script that regenerates fonts and copies them into the app bundle on
 * every build. Xcode build-time vars (PROJECT_DIR, BUILT_PRODUCTS_DIR) are escaped
 * so they survive pbxproj serialization; script-local vars are plain. The config
 * is found by searching upward from the root — set NANOICONS_CONFIG (e.g. in
 * .xcode.env) for a config kept in a subfolder.
 */
const IOS_RUN_SCRIPT = `
        set -e
        NANOICONS_ROOT="\\\${PROJECT_DIR}/.."
        if [ -f "\\\${PROJECT_DIR}/.xcode.env" ]; then source "\\\${PROJECT_DIR}/.xcode.env"; fi
        if [ -f "\\\${PROJECT_DIR}/.xcode.env.local" ]; then source "\\\${PROJECT_DIR}/.xcode.env.local"; fi
        if [ -z "$NODE_BINARY" ]; then NODE_BINARY=node; fi
        CLI_PKG=$("$NODE_BINARY" --print "require.resolve('react-native-nano-icons/package.json', { paths: ['$NANOICONS_ROOT'] })")
        CLI="$(dirname "$CLI_PKG")/lib/commonjs/scripts/cli.js"
        "$NODE_BINARY" "$CLI" generate --platform ios --root "$NANOICONS_ROOT" \${NANOICONS_CONFIG:+--path "$NANOICONS_CONFIG"}
        STAGING="$NANOICONS_ROOT/ios/${IOS_NANOICONS_FONTS_DIR}"
        if [ -d "$STAGING" ]; then
          cp "$STAGING"/*.ttf "\\\${BUILT_PRODUCTS_DIR}/\\\${UNLOCALIZED_RESOURCES_FOLDER_PATH}/" 2>/dev/null || true
        fi
      `;

async function linkIos(
  projectRoot: string,
  builtFonts: BuiltFont[]
): Promise<void> {
  const iosDir = path.join(projectRoot, 'ios');

  const xcodeprojDir = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .find((d) => d.name.endsWith('.xcodeproj'));

  if (!xcodeprojDir) return;

  const appName = xcodeprojDir.name.replace(/\.xcodeproj$/, '');
  const infoPlistPath = path.join(iosDir, appName, 'Info.plist');
  if (!fs.existsSync(infoPlistPath)) return;

  const fontNames = stageIosFonts(projectRoot, builtFonts);

  const plistContent = fs.readFileSync(infoPlistPath, 'utf8');
  const obj = plist.parse(plistContent) as plist.PlistObject;

  const existing = Array.isArray((obj as Record<string, unknown>)['UIAppFonts'])
    ? ((obj as Record<string, unknown>)['UIAppFonts'] as string[])
    : [];

  const merged = [...new Set([...existing, ...fontNames])];
  const updated: plist.PlistObject = {
    ...(obj as Record<string, unknown>),
    UIAppFonts: merged,
  };
  fs.writeFileSync(infoPlistPath, plist.build(updated), 'utf8');

  const pbxprojPath = path.join(iosDir, xcodeprojDir.name, 'project.pbxproj');
  const xcode = require('xcode') as { project: (p: string) => XcodeProject };
  const project = xcode.project(pbxprojPath);
  project.parseSync();

  const hasPhase = Object.entries(
    project.hash.project.objects['PBXShellScriptBuildPhase'] ?? {}
  ).some(
    ([, v]) =>
      typeof v === 'object' && v?.name?.includes(IOS_RUN_SCRIPT_PHASE_NAME)
  );

  if (!hasPhase) {
    project.addBuildPhase(
      [],
      'PBXShellScriptBuildPhase',
      IOS_RUN_SCRIPT_PHASE_NAME,
      project.getFirstTarget().uuid,
      { shellPath: '/bin/sh', shellScript: IOS_RUN_SCRIPT }
    );

    fs.writeFileSync(pbxprojPath, project.writeSync(), 'utf8');
  }
}

export type Platform = 'ios' | 'android';

/**
 * Per-build staging called by the native hooks: copies TTFs into the platform's
 * pickup dir without touching the Xcode project or Info.plist (that one-time
 * wiring lives in `linkBare`). Cheap to run every build — generation is skipped
 * when SVGs are unchanged.
 */
export async function stageFonts(
  projectRoot: string,
  builtFonts: BuiltFont[],
  platform: Platform,
  logger: NanoLogger
): Promise<void> {
  const staticFonts = builtFonts.filter((b) => b.linking === 'static');

  if (!staticFonts.length) {
    logger.info(`No static fonts to stage for ${platform}.`);
    return;
  }

  if (platform === 'android') {
    if (!fs.existsSync(path.join(projectRoot, 'android'))) {
      logger.info('No android/ directory found — skipping font staging.');
      return;
    }
    copyAndroidFonts(projectRoot, staticFonts);
  } else {
    if (!fs.existsSync(path.join(projectRoot, 'ios'))) {
      logger.info('No ios/ directory found — skipping font staging.');
      return;
    }
    stageIosFonts(projectRoot, staticFonts);
  }

  logger.succeed(`Staged ${staticFonts.length} font(s) → ${platform}`);
}

/**
 * One-time setup: link TTFs into whichever native projects exist (android/, ios/,
 * or neither for React Native Web).
 */
export async function linkBare(
  projectRoot: string,
  builtFonts: BuiltFont[],
  logger: NanoLogger
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
    // No native dirs (e.g. React Native Web) — just report where fonts landed.
    const outputDirs = [
      ...new Set(builtFonts.map((b) => path.dirname(b.ttfPath))),
    ];
    const rel = path.relative(projectRoot, outputDirs[0] ?? '');
    logger.info(
      `No native directories found — fonts saved to ${rel}/  (no native dirs, skipping link)`
    );
    return;
  }

  if (!staticFonts.length) {
    logger.succeed(
      `All ${dynamicFonts.length} font(s) use dynamic linking — nothing to bundle natively.`
    );
    return;
  }

  const linkedPlatforms: string[] = [];

  if (hasAndroid) {
    copyAndroidFonts(projectRoot, staticFonts);
    linkedPlatforms.push('android');
  }

  if (hasIos) {
    await linkIos(projectRoot, staticFonts);
    linkedPlatforms.push('ios');
  }

  const dynamicSuffix = dynamicFonts.length
    ? ` (${dynamicFonts.length} dynamic font${
        dynamicFonts.length === 1 ? '' : 's'
      } skipped)`
    : '';
  logger.succeed(
    `Linked fonts → ${linkedPlatforms.join(', ')}${dynamicSuffix}`
  );
}
