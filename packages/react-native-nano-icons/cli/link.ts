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

async function linkAndroid(
  projectRoot: string,
  builtFonts: BuiltFont[]
): Promise<void> {
  const androidFontsPath = path.join(projectRoot, ANDROID_FONTS_DIR);
  fs.mkdirSync(androidFontsPath, { recursive: true });

  for (const b of builtFonts) {
    const dest = path.join(androidFontsPath, path.basename(b.ttfPath));
    fs.copyFileSync(b.ttfPath, dest);
  }
}

async function linkIos(
  projectRoot: string,
  builtFonts: BuiltFont[]
): Promise<void> {
  const iosDir = path.join(projectRoot, 'ios');

  const appDir = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .find((d) => fs.existsSync(path.join(iosDir, d.name, 'Info.plist')));

  if (!appDir) return;

  const fontNames: string[] = [];
  const iosFontsStaging = path.join(iosDir, IOS_NANOICONS_FONTS_DIR);
  fs.mkdirSync(iosFontsStaging, { recursive: true });

  for (const b of builtFonts) {
    const name = path.basename(b.ttfPath);
    fontNames.push(name);
    fs.copyFileSync(b.ttfPath, path.join(iosFontsStaging, name));
  }

  const infoPlistPath = path.join(iosDir, appDir.name, 'Info.plist');
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

  const xcodeprojDir = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .find((d) => d.name.endsWith('.xcodeproj'));

  if (xcodeprojDir) {
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
        project.getFirstTarget().uuid,
        { shellPath: '/bin/sh', shellScript: script }
      );

      fs.writeFileSync(pbxprojPath, project.writeSync(), 'utf8');
    }
  }
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
  logger: NanoLogger
): Promise<void> {
  if (!builtFonts.length) return;

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
    await linkAndroid(projectRoot, builtFonts);
    linkedPlatforms.push('android');
  }

  if (hasIos) {
    await linkIos(projectRoot, builtFonts);
    linkedPlatforms.push('ios');
  }

  logger.succeed(`Linked fonts → ${linkedPlatforms.join(', ')}`);
}
