/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as plist from 'plist';

const addResourceFileCalls: unknown[][] = [];

jest.mock('xcode', () => ({
  project: () => ({
    parseSync() {
      return this;
    },
    getFirstTarget: () => ({ uuid: 'fake-target-uuid' }),
    addBuildPhase: () => {},
    addResourceFile: (...args: unknown[]) => {
      addResourceFileCalls.push(args);
      return {};
    },
    hasFile: () => false,
    writeSync: () => '// fake pbxproj',
    hash: { project: { objects: {} } },
  }),
}));

import { linkBare, linkBareSymbols } from '../cli/link';
import type { NanoLogger } from '../cli/logger';
import type { BuiltFont } from '../cli/build';
import type { BuiltSymbolSet } from '../cli/buildSymbols';

const MINIMAL_PLIST = plist.build({ CFBundleName: 'placeholder' });

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nano-link-'));
}

function makeLogger(): NanoLogger {
  return {
    start: jest.fn(),
    update: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
}

function readUIAppFonts(plistPath: string): string[] {
  const parsed = plist.parse(fs.readFileSync(plistPath, 'utf8')) as Record<
    string,
    unknown
  >;
  return Array.isArray(parsed['UIAppFonts'])
    ? (parsed['UIAppFonts'] as string[])
    : [];
}

describe('linkBare — iOS Info.plist target selection', () => {
  let projectRoot: string;
  let fontDir: string;

  beforeEach(() => {
    projectRoot = makeTmpDir();
    fontDir = makeTmpDir();

    const iosDir = path.join(projectRoot, 'ios');
    fs.mkdirSync(iosDir);

    // decoy - alphabetically-first, should be ignored
    fs.mkdirSync(path.join(iosDir, 'AppExtension'));
    fs.writeFileSync(
      path.join(iosDir, 'AppExtension', 'Info.plist'),
      MINIMAL_PLIST
    );

    // Main app target
    fs.mkdirSync(path.join(iosDir, 'MyApp'));
    fs.writeFileSync(path.join(iosDir, 'MyApp', 'Info.plist'), MINIMAL_PLIST);

    // real target via Info.plist
    fs.mkdirSync(path.join(iosDir, 'MyApp.xcodeproj'));
    fs.writeFileSync(
      path.join(iosDir, 'MyApp.xcodeproj', 'project.pbxproj'),
      '// fake pbxproj'
    );

    fs.writeFileSync(path.join(fontDir, 'TestFont.ttf'), 'fake-ttf');
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fontDir, { recursive: true, force: true });
  });

  test('updates the main app Info.plist, not the alphabetically-first sibling', async () => {
    const builtFont: BuiltFont = {
      fontFamily: 'TestFont',
      ttfPath: path.join(fontDir, 'TestFont.ttf'),
      glyphmapPath: path.join(fontDir, 'TestFont.glyphmap.json'),
      linking: 'static',
    };

    await linkBare(projectRoot, [builtFont], makeLogger());

    const mainPlist = path.join(projectRoot, 'ios', 'MyApp', 'Info.plist');
    const decoyPlist = path.join(
      projectRoot,
      'ios',
      'AppExtension',
      'Info.plist'
    );

    expect(readUIAppFonts(mainPlist)).toContain('TestFont.ttf');
    expect(readUIAppFonts(decoyPlist)).not.toContain('TestFont.ttf');
    expect(readUIAppFonts(decoyPlist)).toEqual([]);
  });
});

describe('linkBareSymbols — iOS asset catalog', () => {
  let projectRoot: string;
  let symbolsOutDir: string;
  let builtSet: BuiltSymbolSet;

  function makeIosApp(withImagesCatalog: boolean): void {
    const iosDir = path.join(projectRoot, 'ios');
    fs.mkdirSync(path.join(iosDir, 'MyApp'), { recursive: true });
    fs.mkdirSync(path.join(iosDir, 'MyApp.xcodeproj'));
    fs.writeFileSync(
      path.join(iosDir, 'MyApp.xcodeproj', 'project.pbxproj'),
      '// fake pbxproj'
    );
    if (withImagesCatalog) {
      fs.mkdirSync(path.join(iosDir, 'MyApp', 'Images.xcassets'));
    }
  }

  beforeEach(() => {
    addResourceFileCalls.length = 0;
    projectRoot = makeTmpDir();
    symbolsOutDir = makeTmpDir();

    const symbolsDir = path.join(symbolsOutDir, 'tabs.symbols');
    const symbolsetDir = path.join(symbolsDir, 'nano.home.symbolset');
    fs.mkdirSync(symbolsetDir, { recursive: true });
    fs.writeFileSync(path.join(symbolsetDir, 'Contents.json'), '{}');
    fs.writeFileSync(path.join(symbolsetDir, 'nano.home.svg'), '<svg/>');

    const drawablesDir = path.join(symbolsOutDir, 'tabs.drawables');
    const drawableFile = path.join(drawablesDir, 'nano_home.xml');
    fs.mkdirSync(drawablesDir, { recursive: true });
    fs.writeFileSync(drawableFile, '<vector/>');

    builtSet = {
      name: 'tabs',
      prefix: 'nano',
      symbolsDir,
      assetDirs: [symbolsetDir],
      drawablesDir,
      drawableFiles: [drawableFile],
      dtsPath: path.join(symbolsOutDir, 'tabs.symbols.d.ts'),
      symbolmapPath: path.join(symbolsOutDir, 'tabs.symbolmap.json'),
      symbols: { home: 'nano.home' },
      drawables: { home: 'nano_home' },
    };
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(symbolsOutDir, { recursive: true, force: true });
  });

  test('copies symbolsets into an existing Images.xcassets without touching the pbxproj', async () => {
    makeIosApp(true);

    await linkBareSymbols(projectRoot, [builtSet], makeLogger());

    const dest = path.join(
      projectRoot,
      'ios',
      'MyApp',
      'Images.xcassets',
      'nano.home.symbolset'
    );
    expect(fs.existsSync(path.join(dest, 'nano.home.svg'))).toBe(true);
    expect(addResourceFileCalls).toHaveLength(0);
    expect(
      fs.existsSync(path.join(projectRoot, 'ios', 'NanoIconsSymbols.xcassets'))
    ).toBe(false);
  });

  test('falls back to a dedicated catalog registered in the pbxproj', async () => {
    makeIosApp(false);

    await linkBareSymbols(projectRoot, [builtSet], makeLogger());

    const catalog = path.join(projectRoot, 'ios', 'NanoIconsSymbols.xcassets');
    expect(fs.existsSync(path.join(catalog, 'Contents.json'))).toBe(true);
    expect(
      fs.existsSync(path.join(catalog, 'nano.home.symbolset', 'nano.home.svg'))
    ).toBe(true);
    expect(addResourceFileCalls).toHaveLength(1);
    expect(addResourceFileCalls[0]![0]).toBe('NanoIconsSymbols.xcassets');
    expect(addResourceFileCalls[0]![1]).toMatchObject({
      lastKnownFileType: 'folder.assetcatalog',
    });
  });
});

const ANDROID_FONTS_DIR = 'android/app/src/main/assets/fonts';

describe('linkBare - dynamic fonts are excluded from native bundling', () => {
  let projectRoot: string;
  let fontDir: string;

  function builtFont(
    fontFamily: string,
    linking: 'static' | 'dynamic'
  ): BuiltFont {
    const ttfPath = path.join(fontDir, `${fontFamily}.ttf`);
    fs.writeFileSync(ttfPath, 'fake-ttf');
    return {
      fontFamily,
      ttfPath,
      glyphmapPath: path.join(fontDir, `${fontFamily}.glyphmap.json`),
      linking,
    };
  }

  beforeEach(() => {
    projectRoot = makeTmpDir();
    fontDir = makeTmpDir();

    // iOS target
    const iosDir = path.join(projectRoot, 'ios');
    fs.mkdirSync(path.join(iosDir, 'MyApp'), { recursive: true });
    fs.writeFileSync(path.join(iosDir, 'MyApp', 'Info.plist'), MINIMAL_PLIST);
    fs.mkdirSync(path.join(iosDir, 'MyApp.xcodeproj'), { recursive: true });
    fs.writeFileSync(
      path.join(iosDir, 'MyApp.xcodeproj', 'project.pbxproj'),
      '// fake pbxproj'
    );

    // Android target
    fs.mkdirSync(path.join(projectRoot, 'android'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fontDir, { recursive: true, force: true });
  });

  test('static font is bundled, dynamic font is skipped (iOS + Android)', async () => {
    await linkBare(
      projectRoot,
      [builtFont('StaticFont', 'static'), builtFont('DynFont', 'dynamic')],
      makeLogger()
    );

    // iOS: only the static font lands in UIAppFonts.
    const plist = path.join(projectRoot, 'ios', 'MyApp', 'Info.plist');
    const fonts = readUIAppFonts(plist);
    expect(fonts).toContain('StaticFont.ttf');
    expect(fonts).not.toContain('DynFont.ttf');

    // Android: only the static TTF is copied into assets/fonts.
    const androidFonts = path.join(projectRoot, ANDROID_FONTS_DIR);
    expect(fs.existsSync(path.join(androidFonts, 'StaticFont.ttf'))).toBe(true);
    expect(fs.existsSync(path.join(androidFonts, 'DynFont.ttf'))).toBe(false);
  });

  test('all-dynamic set bundles nothing natively', async () => {
    const logger = makeLogger();

    await linkBare(
      projectRoot,
      [builtFont('DynA', 'dynamic'), builtFont('DynB', 'dynamic')],
      logger
    );

    // No UIAppFonts entries written.
    expect(
      readUIAppFonts(path.join(projectRoot, 'ios', 'MyApp', 'Info.plist'))
    ).toEqual([]);

    // Android assets/fonts dir is never populated (linkAndroid not called).
    const androidFonts = path.join(projectRoot, ANDROID_FONTS_DIR);
    expect(fs.existsSync(path.join(androidFonts, 'DynA.ttf'))).toBe(false);
    expect(fs.existsSync(path.join(androidFonts, 'DynB.ttf'))).toBe(false);

    expect(logger.succeed).toHaveBeenCalledWith(
      expect.stringContaining('nothing to bundle natively')
    );
  });
});

const IOS_STAGING_DIR = 'ios/nanoicons-fonts';

describe('linkBare - platform detection & edge cases', () => {
  let projectRoot: string;
  let fontDir: string;

  function builtFont(
    fontFamily: string,
    linking: 'static' | 'dynamic' = 'static'
  ): BuiltFont {
    const ttfPath = path.join(fontDir, `${fontFamily}.ttf`);
    fs.writeFileSync(ttfPath, 'fake-ttf');
    return {
      fontFamily,
      ttfPath,
      glyphmapPath: path.join(fontDir, `${fontFamily}.glyphmap.json`),
      linking,
    };
  }

  function addIos(existingFonts?: string[]): string {
    const iosDir = path.join(projectRoot, 'ios');
    fs.mkdirSync(path.join(iosDir, 'MyApp'), { recursive: true });
    const infoPlistPath = path.join(iosDir, 'MyApp', 'Info.plist');
    fs.writeFileSync(
      infoPlistPath,
      existingFonts
        ? plist.build({
            CFBundleName: 'placeholder',
            UIAppFonts: existingFonts,
          })
        : MINIMAL_PLIST
    );
    fs.mkdirSync(path.join(iosDir, 'MyApp.xcodeproj'), { recursive: true });
    fs.writeFileSync(
      path.join(iosDir, 'MyApp.xcodeproj', 'project.pbxproj'),
      '// fake pbxproj'
    );
    return infoPlistPath;
  }

  function addAndroid(): void {
    fs.mkdirSync(path.join(projectRoot, 'android'), { recursive: true });
  }

  beforeEach(() => {
    projectRoot = makeTmpDir();
    fontDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fontDir, { recursive: true, force: true });
  });

  test('empty font list is a no-op (no platform mutation, no success log)', async () => {
    addIos();
    addAndroid();
    const logger = makeLogger();

    await linkBare(projectRoot, [], logger);

    expect(
      readUIAppFonts(path.join(projectRoot, 'ios', 'MyApp', 'Info.plist'))
    ).toEqual([]);
    expect(fs.existsSync(path.join(projectRoot, ANDROID_FONTS_DIR))).toBe(
      false
    );
    expect(fs.existsSync(path.join(projectRoot, IOS_STAGING_DIR))).toBe(false);
    expect(logger.succeed).not.toHaveBeenCalled();
  });

  test('android-only project bundles to android and leaves ios untouched', async () => {
    addAndroid(); // no ios dir
    const logger = makeLogger();

    await linkBare(projectRoot, [builtFont('OnlyAndroid')], logger);

    expect(
      fs.existsSync(
        path.join(projectRoot, ANDROID_FONTS_DIR, 'OnlyAndroid.ttf')
      )
    ).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'ios'))).toBe(false);
    expect(logger.succeed).toHaveBeenCalledWith(
      expect.stringContaining('android')
    );
  });

  test('no native directories (e.g. RN Web) → reports output dir, copies nothing', async () => {
    const logger = makeLogger();

    await linkBare(projectRoot, [builtFont('WebFont')], logger);

    expect(fs.existsSync(path.join(projectRoot, ANDROID_FONTS_DIR))).toBe(
      false
    );
    expect(fs.existsSync(path.join(projectRoot, IOS_STAGING_DIR))).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('No native directories found')
    );
    expect(logger.succeed).not.toHaveBeenCalled();
  });

  test('ios TTF is copied into the nanoicons-fonts staging dir', async () => {
    addIos();

    await linkBare(projectRoot, [builtFont('StagedFont')], makeLogger());

    expect(
      fs.existsSync(path.join(projectRoot, IOS_STAGING_DIR, 'StagedFont.ttf'))
    ).toBe(true);
  });

  test('UIAppFonts merges with pre-existing entries without clobbering them', async () => {
    const infoPlistPath = addIos(['PreExisting.ttf']);

    await linkBare(projectRoot, [builtFont('NewFont')], makeLogger());

    const fonts = readUIAppFonts(infoPlistPath);
    expect(fonts).toContain('PreExisting.ttf');
    expect(fonts).toContain('NewFont.ttf');
  });

  test('running twice is idempotent — no duplicate UIAppFonts entries', async () => {
    const infoPlistPath = addIos();
    const fonts = [builtFont('Idem')];

    await linkBare(projectRoot, fonts, makeLogger());
    await linkBare(projectRoot, fonts, makeLogger());

    const entries = readUIAppFonts(infoPlistPath);
    expect(entries.filter((f) => f === 'Idem.ttf')).toHaveLength(1);
  });
});
