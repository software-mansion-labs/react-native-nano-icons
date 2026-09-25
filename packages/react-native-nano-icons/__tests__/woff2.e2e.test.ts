/** @jest-environment node */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Font, woff2 } from 'fonteditor-core';

import { runFontPipeline } from '../src/core/pipeline/index';
import type { NanoGlyphMap } from '../src/core/types';

const FONT_FAMILY = 'TestWeb';
const INPUT_HASH = 'abcdef0123456789';
const WOFF2_MAGIC = 'wOF2';

const RECT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="10" height="10"/></svg>';
const CIRCLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>';

const CONFIG = {
  fontFamily: FONT_FAMILY,
  upm: 1024,
  safeZone: 1020,
  startUnicode: 0xe900,
  linking: 'static' as const,
};

function parseTtf(buffer: Buffer) {
  return Font.create(buffer, { type: 'ttf', hinting: false }).get();
}

describe('Pipeline E2E — woff2 output', () => {
  beforeAll(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  let inputDir: string;
  let outputDir: string;
  let tempDir: string;
  let ttfPath: string;
  let woff2Path: string;
  let glyphmapPath: string;

  beforeEach(async () => {
    inputDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-woff2-in-'));
    outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-woff2-out-'));
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-woff2-tmp-'));
    await fsp.writeFile(path.join(inputDir, 'square.svg'), RECT_SVG);
    ttfPath = path.join(outputDir, `${FONT_FAMILY}.ttf`);
    woff2Path = path.join(outputDir, `${FONT_FAMILY}.woff2`);
    glyphmapPath = path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`);
  });

  afterEach(() => {
    for (const dir of [inputDir, outputDir, tempDir]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('without web no .woff2 is written and the glyphmap has no m.w', async () => {
    const result = await runFontPipeline(
      CONFIG,
      { inputDir, outputDir, tempDir },
      { inputHash: INPUT_HASH }
    );

    expect(result.woff2Path).toBeUndefined();
    expect(fs.existsSync(woff2Path)).toBe(false);
    const glyphmap = JSON.parse(
      await fsp.readFile(glyphmapPath, 'utf8')
    ) as NanoGlyphMap;
    expect(glyphmap.m.w).toBeUndefined();
  });

  test('with web the .woff2 is a WOFF2 wrapper of the exact TTF build', async () => {
    const result = await runFontPipeline(
      { ...CONFIG, web: true },
      { inputDir, outputDir, tempDir },
      { inputHash: INPUT_HASH }
    );

    expect(result.woff2Path).toBe(woff2Path);
    const woff2Bytes = await fsp.readFile(woff2Path);
    const ttfBytes = await fsp.readFile(ttfPath);

    expect(woff2Bytes.subarray(0, 4).toString('latin1')).toBe(WOFF2_MAGIC);
    expect(woff2Bytes.length).toBeLessThan(ttfBytes.length);

    await woff2.init();
    const decoded = parseTtf(Buffer.from(woff2.decode(woff2Bytes)));
    const original = parseTtf(ttfBytes);

    expect(decoded.glyf.length).toBe(original.glyf.length);
    expect(decoded.name.fontFamily).toBe(original.name.fontFamily);
    expect(decoded.name.fontFamily).toBe(result.family);
    expect(decoded.head.unitsPerEm).toBe(CONFIG.upm);

    const glyphmap = JSON.parse(
      await fsp.readFile(glyphmapPath, 'utf8')
    ) as NanoGlyphMap;
    expect(glyphmap.m.w).toBe(true);
  });

  test('rebuilding the TTF rewrites the .woff2 from the new glyphs', async () => {
    await runFontPipeline(
      { ...CONFIG, web: true },
      { inputDir, outputDir, tempDir },
      { inputHash: INPUT_HASH }
    );
    const firstTtf = await fsp.readFile(ttfPath);
    const firstWoff2 = await fsp.readFile(woff2Path);

    await fsp.writeFile(path.join(inputDir, 'square.svg'), CIRCLE_SVG);
    await runFontPipeline(
      { ...CONFIG, web: true },
      { inputDir, outputDir, tempDir },
      { inputHash: INPUT_HASH }
    );
    const secondTtf = await fsp.readFile(ttfPath);
    const secondWoff2 = await fsp.readFile(woff2Path);

    expect(secondTtf.equals(firstTtf)).toBe(false);
    expect(secondWoff2.equals(firstWoff2)).toBe(false);
  });
});
