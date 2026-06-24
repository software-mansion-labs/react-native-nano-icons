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
      manifestTsPath: path.join(symbolsOutDir, 'tabs.symbols.ts'),
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
