/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildAllFonts, checkAllFonts } from '../cli/build';
import { buildAllSymbols, checkAllSymbols } from '../cli/buildSymbols';

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

  test('freshly built sets are up to date', () => {
    expect(checkAllFonts(iconSets, projectRoot)).toEqual([]);
    expect(checkAllSymbols(symbolSets, projectRoot)).toEqual([]);
  });

  test('a static font whose linked copy is missing or differs is out of date', () => {
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
      expect(check()).toEqual([
        {
          name: 'CheckIcons',
          reason: `android/app/src/main/assets/fonts/${family}.ttf is missing`,
        },
      ]);

      fs.copyFileSync(ttf, androidCopy);
      fs.writeFileSync(iosCopy, 'old font');
      expect(check()).toEqual([
        {
          name: 'CheckIcons',
          reason: 'ios/nanoicons-fonts/CheckIcons.ttf is out of date',
        },
      ]);

      fs.copyFileSync(ttf, iosCopy);
      expect(check()).toEqual([]);
    } finally {
      fs.rmSync(path.join(projectRoot, 'android'), { recursive: true });
      fs.rmSync(path.join(projectRoot, 'ios'), { recursive: true });
    }
  });

  test('an edited SVG makes its set out of date, and nothing is written', () => {
    const before = snapshot(projectRoot);
    for (const dir of ['icons', 'symbols']) {
      fs.appendFileSync(path.join(projectRoot, dir, 'home.svg'), '\n');
    }
    const edited = snapshot(projectRoot);

    expect(checkAllFonts(iconSets, projectRoot)).toEqual([
      {
        name: 'CheckIcons',
        reason: 'its SVGs, options or installed versions changed',
      },
    ]);
    expect(checkAllSymbols(symbolSets, projectRoot)).toEqual([
      {
        name: 'tabs',
        reason: 'its SVGs, prefix or installed versions changed',
      },
    ]);
    expect(snapshot(projectRoot)).toEqual(edited);
    expect(Object.keys(edited).sort()).toEqual(Object.keys(before).sort());
  });
});
