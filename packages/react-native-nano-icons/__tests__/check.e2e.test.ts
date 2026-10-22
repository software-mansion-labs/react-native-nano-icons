/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NANO_PACKAGE_ROOT = path.resolve(__dirname, '..');

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
