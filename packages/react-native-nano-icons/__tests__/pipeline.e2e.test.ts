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
// Helpers
// ---------------------------------------------------------------------------

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(PACKAGE_ROOT, 'test_icons', 'swm_icons', 'outline');
const UPM = 1000;
const SAFE_ZONE = 800;
const START_UNICODE = 0xe000;
const FONT_FAMILY = 'TestOutline';

// ---------------------------------------------------------------------------
// Suite 1 — single-colour outline icons
// ---------------------------------------------------------------------------

describe('Pipeline E2E — outline (single-colour)', () => {
  let outputDir: string;
  let tempDir: string;
  let ttfPath: string;
  let glyphmapPath: string;
  let glyphmap: NanoGlyphMap;
  let svgFiles: string[];

  beforeAll(async () => {
    outputDir = path.join(os.tmpdir(), `nano-e2e-${Date.now()}`);
    tempDir = path.join(os.tmpdir(), `nano-e2e-tmp-${Date.now()}`);

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

    svgFiles = (await fsp.readdir(INPUT_DIR)).filter((f) =>
      f.toLowerCase().endsWith('.svg')
    );
  });

  afterAll(() => {
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  // ── Input ────────────────────────────────────────────────────────────────

  test('input directory exists and contains SVG files', () => {
    expect(fs.existsSync(INPUT_DIR)).toBe(true);
    expect(svgFiles.length).toBeGreaterThan(0);
  });

  // ── Output files ─────────────────────────────────────────────────────────

  test('TTF output file exists and is non-empty', () => {
    expect(fs.existsSync(ttfPath)).toBe(true);
    expect(fs.statSync(ttfPath).size).toBeGreaterThan(0);
  });

  test('glyphmap JSON output file exists and is non-empty', () => {
    expect(fs.existsSync(glyphmapPath)).toBe(true);
    expect(fs.statSync(glyphmapPath).size).toBeGreaterThan(0);
  });

  // ── Glyphmap meta ─────────────────────────────────────────────────────────

  test('glyphmap meta.fontFamily matches config', () => {
    expect(glyphmap.meta.fontFamily).toBe(FONT_FAMILY);
  });

  test('glyphmap meta.upm matches config', () => {
    expect(glyphmap.meta.upm).toBe(UPM);
  });

  test('glyphmap meta.safeZone matches config', () => {
    expect(glyphmap.meta.safeZone).toBe(SAFE_ZONE);
  });

  test('glyphmap meta.startUnicode matches config', () => {
    expect(glyphmap.meta.startUnicode).toBe(START_UNICODE);
  });

  // ── Glyphmap icons ───────────────────────────────────────────────────────

  test('every SVG filename has a corresponding glyphmap entry', () => {
    const iconNames = svgFiles.map((f) => path.parse(f).name);
    for (const name of iconNames) {
      expect(glyphmap.icons).toHaveProperty(name);
    }
  });

  test('icon count matches SVG file count', () => {
    expect(Object.keys(glyphmap.icons).length).toBe(svgFiles.length);
  });

  // ── Codepoints ───────────────────────────────────────────────────────────

  test('all layer codepoints are sequential from startUnicode with no gaps', () => {
    const all: number[] = [];
    for (const entry of Object.values(glyphmap.icons)) {
      for (const layer of entry.layers) {
        all.push(layer.codepoint);
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
    for (const [name, entry] of Object.entries(glyphmap.icons)) {
      expect(entry.adv).toBeGreaterThan(0);
      expect(Number.isInteger(entry.adv)).toBe(true);
      // Helpful failure label:
      if (!Number.isInteger(entry.adv) || entry.adv <= 0) {
        throw new Error(`${name} has invalid adv=${entry.adv}`);
      }
    }
  });

  // ── TTF binary validity ───────────────────────────────────────────────────

  test('TTF magic bytes are 00 01 00 00 (TrueType sfVersion)', () => {
    const buf = fs.readFileSync(ttfPath);
    expect(buf[0]).toBe(0x00);
    expect(buf[1]).toBe(0x01);
    expect(buf[2]).toBe(0x00);
    expect(buf[3]).toBe(0x00);
  });

  // ── Font metrics via fonteditor-core ─────────────────────────────────────

  test('TTF unitsPerEm matches UPM config', () => {
    const { Font } =
      require('fonteditor-core') as typeof import('fonteditor-core');
    const buf = fs.readFileSync(ttfPath);
    const font = Font.create(buf, { type: 'ttf' });
    const data = font.get();
    expect(data.head!.unitsPerEm).toBe(UPM);
  });

  test('OS/2 USE_TYPO_METRICS flag is set', () => {
    const { Font } =
      require('fonteditor-core') as typeof import('fonteditor-core');
    const buf = fs.readFileSync(ttfPath);
    const font = Font.create(buf, { type: 'ttf' });
    const data = font.get();
    // fsSelection bit 7 = USE_TYPO_METRICS
    expect(data['OS/2']!.fsSelection & (1 << 7)).toBeTruthy();
  });

  test('hhea ascent equals UPM and descent equals 0', () => {
    const { Font } =
      require('fonteditor-core') as typeof import('fonteditor-core');
    const buf = fs.readFileSync(ttfPath);
    const font = Font.create(buf, { type: 'ttf' });
    const data = font.get();
    expect(data.hhea!.ascent).toBe(UPM);
    expect(data.hhea!.descent).toBe(0);
  });
});
