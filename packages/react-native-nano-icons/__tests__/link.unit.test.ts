/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as plist from 'plist';

const mockXcodeProject = {
  parseSync() {
    return this;
  },
  getFirstTarget: () => ({ uuid: 'fake-target-uuid' }),
  addBuildPhase: () => {},
  writeSync: () => '// fake pbxproj',
  hash: { project: { objects: {} as Record<string, unknown> } },
};

jest.mock('xcode', () => ({
  project: () => mockXcodeProject,
}));

import { linkBare } from '../cli/link';
import type { NanoLogger } from '../cli/logger';
import type { BuiltFont } from '../cli/build';

const MINIMAL_PLIST = plist.build({ CFBundleName: 'placeholder' });

beforeEach(() => {
  mockXcodeProject.hash.project.objects = {};
});

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

  test('uses the conventional Info.plist path as a fallback, not the alphabetically-first sibling', async () => {
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

  test('uses INFOPLIST_FILE from the first app target build configuration', async () => {
    const conventionalPlist = path.join(
      projectRoot,
      'ios',
      'MyApp',
      'Info.plist'
    );
    fs.rmSync(conventionalPlist);
    const debugPlist = path.join(
      projectRoot,
      'ios',
      'Resources',
      'Debug-Info.plist'
    );
    const releasePlist = path.join(
      projectRoot,
      'ios',
      'Resources',
      'Release-Info.plist'
    );
    fs.mkdirSync(path.dirname(debugPlist));
    fs.writeFileSync(debugPlist, MINIMAL_PLIST);
    fs.writeFileSync(releasePlist, MINIMAL_PLIST);

    mockXcodeProject.hash.project.objects = {
      PBXNativeTarget: {
        APP_TARGET: {
          productType: '"com.apple.product-type.application"',
          buildConfigurationList: 'APP_CONFIGURATIONS',
        },
      },
      XCConfigurationList: {
        APP_CONFIGURATIONS: {
          buildConfigurations: [
            { value: 'DEBUG_CONFIGURATION' },
            { value: 'RELEASE_CONFIGURATION' },
          ],
        },
      },
      XCBuildConfiguration: {
        DEBUG_CONFIGURATION: {
          buildSettings: { INFOPLIST_FILE: 'Resources/Debug-Info.plist' },
        },
        RELEASE_CONFIGURATION: {
          buildSettings: {
            INFOPLIST_FILE: '$(SRCROOT)/Resources/Release-Info.plist',
          },
        },
      },
    };

    const builtFont: BuiltFont = {
      fontFamily: 'TestFont',
      ttfPath: path.join(fontDir, 'TestFont.ttf'),
      glyphmapPath: path.join(fontDir, 'TestFont.glyphmap.json'),
      linking: 'static',
    };

    await linkBare(projectRoot, [builtFont], makeLogger());

    expect(readUIAppFonts(debugPlist)).toContain('TestFont.ttf');
    expect(readUIAppFonts(releasePlist)).toContain('TestFont.ttf');
    expect(
      readUIAppFonts(
        path.join(projectRoot, 'ios', 'AppExtension', 'Info.plist')
      )
    ).toEqual([]);
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

  test('does not report iOS as linked when no Info.plist can be resolved', async () => {
    const iosDir = path.join(projectRoot, 'ios');
    fs.mkdirSync(path.join(iosDir, 'MyApp.xcodeproj'), { recursive: true });
    fs.writeFileSync(
      path.join(iosDir, 'MyApp.xcodeproj', 'project.pbxproj'),
      '// fake pbxproj'
    );
    const logger = makeLogger();

    await linkBare(projectRoot, [builtFont('UnlinkedIos')], logger);

    expect(fs.existsSync(path.join(projectRoot, IOS_STAGING_DIR))).toBe(false);
    expect(logger.succeed).toHaveBeenCalledWith(
      expect.not.stringContaining('ios')
    );
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
