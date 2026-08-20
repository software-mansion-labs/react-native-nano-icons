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
  getFirstTarget: () => { uuid: string; buildConfigurationList?: unknown };
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
      objects: Record<string, Record<string, XcodeObject>>;
    };
  };
};

type XcodeObject = {
  buildConfigurationList?: unknown;
  buildConfigurations?: unknown;
  buildSettings?: Record<string, unknown>;
  name?: string;
  productType?: string;
  shellScript?: string;
};

const ANDROID_FONTS_DIR = 'android/app/src/main/assets/fonts';
const IOS_NANOICONS_FONTS_DIR = 'nanoicons-fonts';
const IOS_RUN_SCRIPT_PHASE_NAME = 'Copy nanoicons fonts';

function xcodeReferenceUuid(reference: unknown): string | undefined {
  if (typeof reference === 'string') return reference;
  if (
    typeof reference === 'object' &&
    reference !== null &&
    'value' in reference &&
    typeof reference.value === 'string'
  ) {
    return reference.value;
  }
  return undefined;
}

function getFirstAppTarget(project: XcodeProject): {
  uuid: string;
  target: XcodeObject;
} {
  const targets = project.hash.project.objects['PBXNativeTarget'] ?? {};
  const appTarget = Object.entries(targets).find(
    ([uuid, target]) =>
      !uuid.endsWith('_comment') &&
      target.productType?.replace(/['\"]/g, '') ===
        'com.apple.product-type.application'
  );

  if (appTarget) return { uuid: appTarget[0], target: appTarget[1] };

  const target = project.getFirstTarget();
  return { uuid: target.uuid, target };
}

function resolveInfoPlistPaths(
  project: XcodeProject,
  iosDir: string,
  fallbackPath: string
): string[] {
  const { target } = getFirstAppTarget(project);
  const configurationListUuid = xcodeReferenceUuid(
    target.buildConfigurationList
  );
  const configurationList = configurationListUuid
    ? project.hash.project.objects['XCConfigurationList']?.[
        configurationListUuid
      ]
    : undefined;
  const buildConfigurationUuids = Array.isArray(
    configurationList?.buildConfigurations
  )
    ? configurationList.buildConfigurations
        .map(xcodeReferenceUuid)
        .filter((uuid): uuid is string => uuid !== undefined)
    : [];

  const paths = buildConfigurationUuids
    .map(
      (uuid) =>
        project.hash.project.objects['XCBuildConfiguration']?.[uuid]
          ?.buildSettings?.['INFOPLIST_FILE']
    )
    .filter((setting): setting is string => typeof setting === 'string')
    .map((setting) =>
      setting
        .replace(/^['\"]|['\"]$/g, '')
        .replace(
          /\$\((?:SRCROOT|PROJECT_DIR)\)|\$\{(?:SRCROOT|PROJECT_DIR)\}/g,
          iosDir
        )
    )
    .map((setting) => path.resolve(iosDir, setting))
    .filter((plistPath) => fs.existsSync(plistPath));

  return paths.length
    ? [...new Set(paths)]
    : fs.existsSync(fallbackPath)
      ? [fallbackPath]
      : [];
}

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
): Promise<boolean> {
  const iosDir = path.join(projectRoot, 'ios');

  const xcodeprojDir = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .find((d) => d.name.endsWith('.xcodeproj'));

  if (!xcodeprojDir) return false;

  const appName = xcodeprojDir.name.replace(/\.xcodeproj$/, '');
  const pbxprojPath = path.join(iosDir, xcodeprojDir.name, 'project.pbxproj');
  const xcode = require('xcode') as { project: (p: string) => XcodeProject };
  const project = xcode.project(pbxprojPath);
  project.parseSync();

  const infoPlistPaths = resolveInfoPlistPaths(
    project,
    iosDir,
    path.join(iosDir, appName, 'Info.plist')
  );
  if (!infoPlistPaths.length) return false;

  const fontNames: string[] = [];
  const iosFontsStaging = path.join(iosDir, IOS_NANOICONS_FONTS_DIR);
  fs.mkdirSync(iosFontsStaging, { recursive: true });

  for (const b of builtFonts) {
    const name = path.basename(b.ttfPath);
    fontNames.push(name);
    fs.copyFileSync(b.ttfPath, path.join(iosFontsStaging, name));
  }

  for (const infoPlistPath of infoPlistPaths) {
    const plistContent = fs.readFileSync(infoPlistPath, 'utf8');
    const obj = plist.parse(plistContent) as plist.PlistObject;
    const existing = Array.isArray(
      (obj as Record<string, unknown>)['UIAppFonts']
    )
      ? ((obj as Record<string, unknown>)['UIAppFonts'] as string[])
      : [];
    const updated: plist.PlistObject = {
      ...(obj as Record<string, unknown>),
      UIAppFonts: [...new Set([...existing, ...fontNames])],
    };
    fs.writeFileSync(infoPlistPath, plist.build(updated), 'utf8');
  }

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
      getFirstAppTarget(project).uuid,
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
    if (await linkIos(projectRoot, staticFonts)) {
      linkedPlatforms.push('ios');
    }
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
