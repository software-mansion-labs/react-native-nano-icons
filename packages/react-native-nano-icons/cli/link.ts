import fs from 'node:fs';
import path from 'node:path';
import * as plist from 'plist';
import type { NanoLogger } from './logger.js';
import type { BuiltFont } from './build.js';
import type { BuiltSymbolSet } from './buildSymbols.js';
import { catalogRootContentsJson } from '../src/core/symbols/contents.js';
import { toDrawableResourceName } from '../src/utils/naming.js';

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
  addResourceFile: (
    filePath: string,
    opt?: {
      target?: string;
      lastKnownFileType?: string;
      sourceTree?: string;
    },
    group?: string | null
  ) => unknown;
  hasFile: (filePath: string) => boolean;
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
const ANDROID_DRAWABLES_DIR = 'android/app/src/main/res/drawable';
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

  const xcodeprojDir = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .find((d) => d.name.endsWith('.xcodeproj'));

  if (!xcodeprojDir) return;

  const appName = xcodeprojDir.name.replace(XCODEPROJ_RE, '');
  const infoPlistPath = path.join(iosDir, appName, 'Info.plist');
  if (!fs.existsSync(infoPlistPath)) return;

  const fontNames: string[] = [];
  const iosFontsStaging = path.join(iosDir, IOS_NANOICONS_FONTS_DIR);
  fs.mkdirSync(iosFontsStaging, { recursive: true });

  for (const b of builtFonts) {
    const name = path.basename(b.ttfPath);
    fontNames.push(name);
    fs.copyFileSync(b.ttfPath, path.join(iosFontsStaging, name));
  }

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

// ---------------------------------------------------------------------------
// Custom SF Symbol linking (iOS)
// ---------------------------------------------------------------------------

const IOS_SYMBOLS_CATALOG = 'NanoIconsSymbols.xcassets';

function findIosApp(
  projectRoot: string
): { iosDir: string; xcodeprojName: string; appName: string } | null {
  const iosDir = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) return null;

  const xcodeprojDir = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .find((d) => d.name.endsWith('.xcodeproj'));
  if (!xcodeprojDir) return null;

  return {
    iosDir,
    xcodeprojName: xcodeprojDir.name,
    appName: xcodeprojDir.name.replace(XCODEPROJ_RE, ''),
  };
}

// File/folder name matchers (filesystem, CLI-specific).
const XCODEPROJ_RE = /\.xcodeproj$/;
const NANO_ASSET_RE = /\.(symbolset|imageset)$/;
const XML_FILE_RE = /\.xml$/;

// Copy generated asset folders into a catalog, first removing previously
// generated assets for the same prefixes (handles removed icons and mode switches).
export function copySymbolsetsIntoCatalog(
  catalogDir: string,
  builtSymbolSets: BuiltSymbolSet[]
): void {
  const prefixes = new Set(builtSymbolSets.map((s) => s.prefix));

  // Remove stale assets owned by our prefixes.
  for (const entry of fs.readdirSync(catalogDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !NANO_ASSET_RE.test(entry.name)) continue;
    const assetName = entry.name.replace(NANO_ASSET_RE, '');
    for (const prefix of prefixes) {
      if (assetName.startsWith(`${prefix}.`)) {
        fs.rmSync(path.join(catalogDir, entry.name), {
          recursive: true,
          force: true,
        });
        break;
      }
    }
  }

  for (const set of builtSymbolSets) {
    for (const assetDir of set.assetDirs) {
      const dest = path.join(catalogDir, path.basename(assetDir));
      fs.cpSync(assetDir, dest, { recursive: true });
    }
  }
}

/**
 * Link custom SF Symbols into the iOS app. Primary path writes into the app's
 * existing Images.xcassets (no pbxproj changes). Fallback (no Images.xcassets)
 * creates NanoIconsSymbols.xcassets and registers it on the first target.
 */
export async function linkBareSymbols(
  projectRoot: string,
  builtSymbolSets: BuiltSymbolSet[],
  logger: NanoLogger
): Promise<void> {
  if (!builtSymbolSets.length) return;

  const app = findIosApp(projectRoot);
  if (!app) {
    const outputDirs = [
      ...new Set(builtSymbolSets.map((s) => path.dirname(s.symbolsDir))),
    ];
    const rel = path.relative(projectRoot, outputDirs[0] ?? '');
    logger.info(
      `No ios/ project found — symbols saved to ${rel}/  (skipping link)`
    );
    return;
  }

  const imagesCatalog = path.join(app.iosDir, app.appName, 'Images.xcassets');

  if (fs.existsSync(imagesCatalog)) {
    copySymbolsetsIntoCatalog(imagesCatalog, builtSymbolSets);
    logger.succeed(`Linked symbols → ios/${app.appName}/Images.xcassets`);
    return;
  }

  // Fallback: dedicated catalog + pbxproj resource entry
  const catalogDir = path.join(app.iosDir, IOS_SYMBOLS_CATALOG);
  fs.mkdirSync(catalogDir, { recursive: true });
  fs.writeFileSync(
    path.join(catalogDir, 'Contents.json'),
    catalogRootContentsJson(),
    'utf8'
  );
  copySymbolsetsIntoCatalog(catalogDir, builtSymbolSets);

  const pbxprojPath = path.join(
    app.iosDir,
    app.xcodeprojName,
    'project.pbxproj'
  );
  const xcode = require('xcode') as { project: (p: string) => XcodeProject };
  const project = xcode.project(pbxprojPath);
  project.parseSync();

  if (!project.hasFile(IOS_SYMBOLS_CATALOG)) {
    try {
      project.addResourceFile(
        IOS_SYMBOLS_CATALOG,
        {
          target: project.getFirstTarget().uuid,
          lastKnownFileType: 'folder.assetcatalog',
          sourceTree: '"<group>"',
        },
        null
      );
      fs.writeFileSync(pbxprojPath, project.writeSync(), 'utf8');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        `Could not register ${IOS_SYMBOLS_CATALOG} in the Xcode project (${message}). ` +
          `Add ios/${IOS_SYMBOLS_CATALOG} to your app target's resources in Xcode once.`
      );
      return;
    }
  }

  logger.succeed(`Linked symbols → ios/${IOS_SYMBOLS_CATALOG}`);
}

// ---------------------------------------------------------------------------
// Android VectorDrawable linking
// ---------------------------------------------------------------------------

// Copy generated VectorDrawable XML into a res/drawable dir, first removing
// previously generated drawables owned by our prefixes (handles removed icons).
export function copyDrawablesIntoResDir(
  drawableDir: string,
  builtSymbolSets: BuiltSymbolSet[]
): void {
  fs.mkdirSync(drawableDir, { recursive: true });

  const prefixes = new Set(
    builtSymbolSets.map((s) => toDrawableResourceName(s.prefix))
  );

  // Remove stale drawables owned by our prefixes (e.g. "nano_*.xml").
  for (const entry of fs.readdirSync(drawableDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.xml')) continue;
    const base = entry.name.replace(XML_FILE_RE, '');
    for (const prefix of prefixes) {
      if (base.startsWith(`${prefix}_`)) {
        fs.rmSync(path.join(drawableDir, entry.name), { force: true });
        break;
      }
    }
  }

  for (const set of builtSymbolSets) {
    for (const file of set.drawableFiles) {
      fs.copyFileSync(file, path.join(drawableDir, path.basename(file)));
    }
  }
}

/**
 * Link generated VectorDrawables into the Android app's res/drawable. They are
 * compiled automatically by AGP and resolve by name via getIdentifier — the
 * native-tab-bar counterpart to the iOS asset catalog. No gradle changes needed.
 */
export async function linkBareAndroidDrawables(
  projectRoot: string,
  builtSymbolSets: BuiltSymbolSet[],
  logger: NanoLogger
): Promise<void> {
  if (!builtSymbolSets.length) return;

  if (!fs.existsSync(path.join(projectRoot, 'android'))) {
    logger.info('No android/ project found — skipping drawable link');
    return;
  }

  const drawableDir = path.join(projectRoot, ANDROID_DRAWABLES_DIR);
  copyDrawablesIntoResDir(drawableDir, builtSymbolSets);
  logger.succeed(`Linked drawables → ${ANDROID_DRAWABLES_DIR}`);
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

  if (!staticFonts.length) {
    logger.succeed(
      `All ${dynamicFonts.length} font(s) use dynamic linking — nothing to bundle natively.`
    );
    return;
  }

  const linkedPlatforms: string[] = [];

  if (hasAndroid) {
    await linkAndroid(projectRoot, staticFonts);
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
