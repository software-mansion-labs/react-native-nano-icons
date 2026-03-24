/** @jest-environment node */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Must be set before any pipeline import so getPackageRoot() picks it up.
process.env.NANO_PACKAGE_ROOT = path.resolve(__dirname, '..');

import { runPipeline } from '../src/core/pipeline/run';
import type { NanoGlyphMap } from '../src/core/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(PACKAGE_ROOT, 'test_icons', 'clippath');
const UPM = 1000;
const SAFE_ZONE = 800;
const START_UNICODE = 0xe000;
const FONT_FAMILY = 'TestClipPath';

// ---------------------------------------------------------------------------
// Suite — clipPath icons
// ---------------------------------------------------------------------------

describe('Pipeline E2E — clipPath', () => {
  let outputDir: string;
  let tempDir: string;
  let ttfPath: string;
  let glyphmapPath: string;
  let glyphmap: NanoGlyphMap;

  beforeAll(async () => {
    outputDir = path.join(os.tmpdir(), `nano-clippath-e2e-${Date.now()}`);
    tempDir = path.join(os.tmpdir(), `nano-clippath-e2e-tmp-${Date.now()}`);

    await runPipeline(
      {
        fontFamily: FONT_FAMILY,
        upm: UPM,
        safeZone: SAFE_ZONE,
        startUnicode: START_UNICODE,
      },
      { inputDir: INPUT_DIR, outputDir, tempDir }
    );

    ttfPath = path.join(outputDir, `${FONT_FAMILY}.ttf`);
    glyphmapPath = path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`);

    const raw = await fsp.readFile(glyphmapPath, 'utf8');
    glyphmap = JSON.parse(raw) as NanoGlyphMap;
  }, 180_000);

  afterAll(() => {
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  // ── Output files ──────────────────────────────────────────────────────────

  test('TTF output file exists and is non-empty', () => {
    expect(fs.existsSync(ttfPath)).toBe(true);
    expect(fs.statSync(ttfPath).size).toBeGreaterThan(0);
  });

  test('TTF magic bytes are 00 01 00 00 (TrueType sfVersion)', () => {
    const buf = fs.readFileSync(ttfPath);
    expect(buf[0]).toBe(0x00);
    expect(buf[1]).toBe(0x01);
    expect(buf[2]).toBe(0x00);
    expect(buf[3]).toBe(0x00);
  });

  test('glyphmap JSON is parseable', () => {
    expect(glyphmap).toBeDefined();
    expect(typeof glyphmap).toBe('object');
  });

  // ── teest icon ────────────────────────────────────────────────────────────

  test('glyphmap has a "teest" entry', () => {
    expect(glyphmap.i).toHaveProperty('teest');
  });

  test('"teest" has at least 2 layers (clipped paths + red circle)', () => {
    const [, layers] = glyphmap.i['teest']!;
    expect(layers.length).toBeGreaterThanOrEqual(2);
  });

  // ── Codepoints ────────────────────────────────────────────────────────────

  test('all layer codepoints are sequential from startUnicode with no gaps', () => {
    const all: number[] = [];
    for (const [, layers] of Object.values(glyphmap.i)) {
      for (const [codepoint] of layers) {
        all.push(codepoint);
      }
    }
    all.sort((a, b) => a - b);

    expect(all[0]).toBe(START_UNICODE);
    for (let i = 1; i < all.length; i++) {
      expect(all[i]).toBe(all[i - 1]! + 1);
    }
  });

  // ── Advance widths ────────────────────────────────────────────────────────

  test('all advance widths are positive integers', () => {
    for (const [adv] of Object.values(glyphmap.i)) {
      expect(adv).toBeGreaterThan(0);
      expect(Number.isInteger(adv)).toBe(true);
    }
  });
});
