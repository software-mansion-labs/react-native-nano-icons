/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as plist from 'plist';

import { stageFonts } from '../cli/link';
import type { NanoLogger } from '../cli/logger';
import type { BuiltFont } from '../cli/build';

const ANDROID_FONTS_DIR = 'android/app/src/main/assets/fonts';
const IOS_STAGING_DIR = 'ios/nanoicons-fonts';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nano-stage-'));
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

describe('stageFonts — per-build staging', () => {
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

  function addIos(uiAppFonts?: string[]): string {
    const iosDir = path.join(projectRoot, 'ios');
    fs.mkdirSync(path.join(iosDir, 'MyApp'), { recursive: true });
    const infoPlistPath = path.join(iosDir, 'MyApp', 'Info.plist');
    fs.writeFileSync(
      infoPlistPath,
      plist.build(
        uiAppFonts
          ? { CFBundleName: 'placeholder', UIAppFonts: uiAppFonts }
          : { CFBundleName: 'placeholder' }
      )
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

  test('android: copies static TTFs into assets/fonts, skips dynamic', async () => {
    addAndroid();

    await stageFonts(
      projectRoot,
      [builtFont('StaticA'), builtFont('DynA', 'dynamic')],
      'android',
      makeLogger()
    );

    const fontsDir = path.join(projectRoot, ANDROID_FONTS_DIR);
    expect(fs.existsSync(path.join(fontsDir, 'StaticA.ttf'))).toBe(true);
    expect(fs.existsSync(path.join(fontsDir, 'DynA.ttf'))).toBe(false);
  });

  test('ios: copies static TTFs into the staging dir, skips dynamic', async () => {
    addIos();

    await stageFonts(
      projectRoot,
      [builtFont('StaticB'), builtFont('DynB', 'dynamic')],
      'ios',
      makeLogger()
    );

    const stagingDir = path.join(projectRoot, IOS_STAGING_DIR);
    expect(fs.existsSync(path.join(stagingDir, 'StaticB.ttf'))).toBe(true);
    expect(fs.existsSync(path.join(stagingDir, 'DynB.ttf'))).toBe(false);
  });

  test('ios: does NOT register fonts in Info.plist (contract of the per-build hook)', async () => {
    const infoPlistPath = addIos(['Existing.ttf']);
    const before = fs.readFileSync(infoPlistPath, 'utf8');

    await stageFonts(
      projectRoot,
      [builtFont('NewFamily')],
      'ios',
      makeLogger()
    );

    // Plist is left byte-for-byte untouched — registration is linkBare's job.
    const after = fs.readFileSync(infoPlistPath, 'utf8');
    expect(after).toBe(before);

    const parsed = plist.parse(after) as Record<string, unknown>;
    expect(parsed['UIAppFonts']).toEqual(['Existing.ttf']);
  });

  test('ios: does not create or touch an Xcode project file', async () => {
    addIos();

    await stageFonts(
      projectRoot,
      [builtFont('NoProjectEdit')],
      'ios',
      makeLogger()
    );

    const xcodeproj = path.join(projectRoot, 'ios', 'MyApp.xcodeproj');
    expect(fs.existsSync(xcodeproj)).toBe(false);
  });

  test('missing platform dir is a safe no-op', async () => {
    // No android/ directory created.
    const logger = makeLogger();

    await stageFonts(projectRoot, [builtFont('Whatever')], 'android', logger);

    expect(fs.existsSync(path.join(projectRoot, ANDROID_FONTS_DIR))).toBe(
      false
    );
    expect(logger.succeed).not.toHaveBeenCalled();
  });

  test('all-dynamic set stages nothing', async () => {
    addIos();
    addAndroid();
    const logger = makeLogger();

    await stageFonts(
      projectRoot,
      [builtFont('D1', 'dynamic'), builtFont('D2', 'dynamic')],
      'ios',
      logger
    );

    expect(fs.existsSync(path.join(projectRoot, IOS_STAGING_DIR))).toBe(false);
    expect(logger.succeed).not.toHaveBeenCalled();
  });

  test('reports how many fonts were staged', async () => {
    addAndroid();
    const logger = makeLogger();

    await stageFonts(
      projectRoot,
      [builtFont('S1'), builtFont('S2')],
      'android',
      logger
    );

    expect(logger.succeed).toHaveBeenCalledWith(
      expect.stringContaining('Staged 2 font(s) → android')
    );
  });
});
