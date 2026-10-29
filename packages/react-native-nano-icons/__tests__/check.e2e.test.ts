/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildAllFonts, checkAllFonts } from '../cli/build';
import { buildAllSymbols, checkAllSymbols } from '../cli/buildSymbols';
import type { NanoLogger } from '../cli/logger';
import * as packageVersionModule from '../src/utils/packageVersion';

const TEST_ICONS = path.resolve(__dirname, '..', 'test_icons');

function snapshot(dir: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    entries[path.relative(dir, file)] = fs
      .readFileSync(file)
      .toString('base64');
  }
  return entries;
}

describe('check against a real build', () => {
  let projectRoot: string;
  const iconSets = [
    {
      inputDir: 'icons',
      outputDir: 'out',
      fontFamily: 'CheckIcons',
    },
  ];
  const symbolSets = [{ inputDir: 'symbols', outputDir: 'out', name: 'tabs' }];

  beforeAll(async () => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-check-'));
    for (const dir of ['icons', 'symbols']) {
      fs.mkdirSync(path.join(projectRoot, dir));
      fs.copyFileSync(
        path.join(TEST_ICONS, 'swm_icons', 'outline', 'Home1.svg'),
        path.join(projectRoot, dir, 'home.svg')
      );
    }
    await buildAllFonts(iconSets, projectRoot);
    await buildAllSymbols(symbolSets, projectRoot);
  }, 120_000);

  afterAll(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  test('freshly built sets are up to date', async () => {
    expect(await checkAllFonts(iconSets, projectRoot)).toEqual([]);
    expect(await checkAllSymbols(symbolSets, projectRoot)).toEqual([]);
  });

  test('a new toolchain version that builds the same files keeps the sets up to date, and nothing is written', async () => {
    const before = snapshot(projectRoot);
    const succeed = jest.fn();
    const logger = {
      start: () => {},
      update: () => {},
      succeed,
      fail: () => {},
      info: () => {},
      warn: () => {},
    } satisfies NanoLogger;
    jest
      .spyOn(packageVersionModule, 'fontToolchainVersions')
      .mockReturnValue(['@xmldom/xmldom@0.0.0']);
    try {
      expect(await checkAllFonts(iconSets, projectRoot, { logger })).toEqual(
        []
      );
      expect(
        await checkAllSymbols(symbolSets, projectRoot, { logger })
      ).toEqual([]);
    } finally {
      jest.restoreAllMocks();
    }
    expect(succeed.mock.calls).toEqual([
      [
        'CheckIcons.ttf is up to date: its inputs changed, but it builds the same',
      ],
      [
        'tabs symbols are up to date: their inputs changed, but they build the same',
      ],
    ]);
    expect(snapshot(projectRoot)).toEqual(before);
  }, 120_000);

  test('a static font whose linked copy is missing or differs is out of date', async () => {
    const family = JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, 'out', 'CheckIcons.glyphmap.json'),
        'utf8'
      )
    ).m.f;
    const ttf = path.join(projectRoot, 'out', 'CheckIcons.ttf');
    const fontsDir = path.join(
      projectRoot,
      'android/app/src/main/assets/fonts'
    );
    const androidCopy = path.join(fontsDir, `${family}.ttf`);
    const iosCopy = path.join(
      projectRoot,
      'ios/nanoicons-fonts/CheckIcons.ttf'
    );
    const check = () =>
      checkAllFonts(iconSets, projectRoot, { appRoot: projectRoot });

    fs.mkdirSync(fontsDir, { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'ios/App.xcodeproj'), {
      recursive: true,
    });
    fs.mkdirSync(path.dirname(iosCopy));
    try {
      expect(await check()).toEqual([
        {
          name: 'CheckIcons',
          reason: `android/app/src/main/assets/fonts/${family}.ttf is missing`,
        },
      ]);

      fs.copyFileSync(ttf, androidCopy);
      fs.writeFileSync(iosCopy, 'old font');
      expect(await check()).toEqual([
        {
          name: 'CheckIcons',
          reason: 'ios/nanoicons-fonts/CheckIcons.ttf is out of date',
        },
      ]);

      fs.copyFileSync(ttf, iosCopy);
      expect(await check()).toEqual([]);
    } finally {
      fs.rmSync(path.join(projectRoot, 'android'), { recursive: true });
      fs.rmSync(path.join(projectRoot, 'ios'), { recursive: true });
    }
  });

  test('an edited SVG makes its set out of date, and nothing is written', async () => {
    const before = snapshot(projectRoot);
    for (const dir of ['icons', 'symbols']) {
      fs.copyFileSync(
        path.join(TEST_ICONS, 'swm_icons', 'outline', 'Air.svg'),
        path.join(projectRoot, dir, 'home.svg')
      );
    }
    const edited = snapshot(projectRoot);

    expect(await checkAllFonts(iconSets, projectRoot)).toEqual([
      {
        name: 'CheckIcons',
        reason: 'its SVGs, options or installed versions changed',
      },
    ]);
    expect(await checkAllSymbols(symbolSets, projectRoot)).toEqual([
      {
        name: 'tabs',
        reason: 'its SVGs, prefix or installed versions changed',
      },
    ]);
    expect(snapshot(projectRoot)).toEqual(edited);
    expect(Object.keys(edited).sort()).toEqual(Object.keys(before).sort());
  });
});
