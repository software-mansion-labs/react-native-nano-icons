/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.mock('../src/core/pipeline/iconPool', () => {
  const actual = jest.requireActual('../src/core/pipeline/iconPool');
  return { ...actual, prepareIcons: jest.fn(actual.prepareIcons) };
});

import { prepareIcons } from '../src/core/pipeline/iconPool';
import {
  runFontPipeline,
  type PreparedSvgCache,
} from '../src/core/pipeline/index';

const mockPrepareIcons = prepareIcons as jest.MockedFunction<
  typeof prepareIcons
>;

const CONFIG = {
  fontFamily: 'Cached',
  upm: 1024,
  safeZone: 1020,
  startUnicode: 0xe900,
  linking: 'static' as const,
};

function shape(fill: string, r: number): string {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="${r}" fill="${fill}"/></svg>`;
}

let root: string;
let inputDir: string;

function preparedFiles(call: number): string[] {
  return mockPrepareIcons.mock.calls[call]![0].map((t) => t.file);
}

async function build(
  outputDir: string,
  preparedSvgCache?: PreparedSvgCache
): Promise<{ ttf: Buffer; glyphmap: string }> {
  const out = await runFontPipeline(
    CONFIG,
    { inputDir, outputDir, tempDir: path.join(root, 'tmp') },
    { concurrency: 1, inputHash: 'a'.repeat(64), preparedSvgCache }
  );
  return {
    ttf: fs.readFileSync(out.ttfPath),
    glyphmap: fs.readFileSync(out.glyphmapPath, 'utf8'),
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-prep-cache-'));
  inputDir = path.join(root, 'icons');
  fs.mkdirSync(inputDir);
  fs.writeFileSync(path.join(inputDir, 'a.svg'), shape('red', 40));
  fs.writeFileSync(path.join(inputDir, 'b.svg'), shape('blue', 30));
  fs.writeFileSync(path.join(inputDir, 'c.svg'), shape('green', 20));
  mockPrepareIcons.mockClear();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('only changed, added or renamed files are prepared again', async () => {
  const cache: PreparedSvgCache = new Map();
  const out = path.join(root, 'out');

  await build(out, cache);
  expect(preparedFiles(0)).toEqual(['a.svg', 'b.svg', 'c.svg']);

  await build(out, cache);
  expect(preparedFiles(1)).toEqual([]);

  fs.writeFileSync(path.join(inputDir, 'b.svg'), shape('blue', 35));
  fs.writeFileSync(path.join(inputDir, 'd.svg'), shape('black', 10));
  fs.renameSync(path.join(inputDir, 'c.svg'), path.join(inputDir, 'e.svg'));
  await build(out, cache);
  expect(preparedFiles(2).sort()).toEqual(['b.svg', 'd.svg', 'e.svg']);

  fs.unlinkSync(path.join(inputDir, 'a.svg'));
  await build(out, cache);
  expect(preparedFiles(3)).toEqual([]);
});

test('a cached build is byte-identical to a cold build', async () => {
  const cache: PreparedSvgCache = new Map();
  await build(path.join(root, 'warm'), cache);
  fs.writeFileSync(path.join(inputDir, 'b.svg'), shape('blue', 35));

  const cached = await build(path.join(root, 'warm'), cache);
  const cold = await build(path.join(root, 'cold'));

  expect(cached.ttf.equals(cold.ttf)).toBe(true);
  expect(cached.glyphmap).toBe(cold.glyphmap);
});

test('a different upm or safeZone does not hit the cache', async () => {
  const cache: PreparedSvgCache = new Map();
  await build(path.join(root, 'out'), cache);

  await runFontPipeline(
    { ...CONFIG, safeZone: 900 },
    {
      inputDir,
      outputDir: path.join(root, 'out2'),
      tempDir: path.join(root, 'tmp'),
    },
    { concurrency: 1, preparedSvgCache: cache }
  );
  expect(preparedFiles(1)).toEqual(['a.svg', 'b.svg', 'c.svg']);
});
