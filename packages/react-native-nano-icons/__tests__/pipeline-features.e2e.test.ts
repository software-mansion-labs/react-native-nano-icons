/** @jest-environment node */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runPipeline } from '../src/core/pipeline/run';
import type { NanoGlyphMap, NanoLogger } from '../src/core/types';

// ---------------------------------------------------------------------------
// Shared harness
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const TEST_ICONS = path.join(ROOT, 'test_icons');
const PIPELINE = {
  upm: 1000,
  safeZone: 800,
  startUnicode: 0xe000,
  linking: 'static',
} as const;

type Icon = { srcDir: string; name: string };

type RunResult = {
  glyphmap: NanoGlyphMap;
  ttfPath: string;
  outputDir: string;
  tempDir: string;
};

function quietLogger(onWarn: (msg: string) => void): NanoLogger {
  return {
    start: () => {},
    update: () => {},
    succeed: () => {},
    fail: () => {},
    info: () => {},
    warn: onWarn,
  };
}

/**
 * Copy a specific subset of fixture SVGs into a fresh temp dir, run the real
 * pipeline, and return the parsed glyphmap + artifact paths. The input dir is
 * removed immediately; callers clean output/temp via cleanup() in afterAll.
 */
async function runOnSubset(opts: {
  fontFamily: string;
  icons: Icon[];
  onWarn?: (msg: string) => void;
}): Promise<RunResult> {
  const inputDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-feat-in-'));
  const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-feat-out-'));
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-feat-tmp-'));

  try {
    for (const { srcDir, name } of opts.icons) {
      await fsp.copyFile(path.join(srcDir, name), path.join(inputDir, name));
    }

    await runPipeline(
      { ...PIPELINE, fontFamily: opts.fontFamily },
      { inputDir, outputDir, tempDir },
      opts.onWarn ? { logger: quietLogger(opts.onWarn) } : undefined
    );

    const glyphmap = JSON.parse(
      await fsp.readFile(
        path.join(outputDir, `${opts.fontFamily}.glyphmap.json`),
        'utf8'
      )
    ) as NanoGlyphMap;

    return {
      glyphmap,
      ttfPath: path.join(outputDir, `${opts.fontFamily}.ttf`),
      outputDir,
      tempDir,
    };
  } finally {
    await fsp.rm(inputDir, { recursive: true, force: true });
  }
}

function cleanup(...dirs: string[]): void {
  for (const dir of dirs) {
    if (dir && fs.existsSync(dir))
      fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Duotone — multiple colour layers per icon
// ---------------------------------------------------------------------------

describe('Pipeline E2E — duotone (multi-layer)', () => {
  const srcDir = path.join(TEST_ICONS, 'swm_icons', 'duotone');
  const names = ['Alarm.svg', 'Dislike.svg', 'EyeOpen.svg'];
  let res: RunResult;

  beforeAll(async () => {
    res = await runOnSubset({
      fontFamily: 'FeatDuotone',
      icons: names.map((name) => ({ srcDir, name })),
    });
  }, 180_000);

  afterAll(() => cleanup(res?.outputDir, res?.tempDir));

  test('every duotone icon compiles to an entry with a positive advance', () => {
    for (const name of names) {
      const entry = res.glyphmap.i[path.parse(name).name];
      expect(entry).toBeDefined();
      expect(entry![0]).toBeGreaterThan(0);
    }
  });

  test('at least one icon keeps multiple layers with distinct colours', () => {
    const multi = Object.values(res.glyphmap.i).filter(
      ([, layers]) => layers.length >= 2
    );
    expect(multi.length).toBeGreaterThan(0);

    const [, layers] = multi[0]!;
    const distinctColors = new Set(layers.map(([, color]) => color));
    expect(distinctColors.size).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Even-odd — holes survive winding conversion (multi-contour geometry)
// ---------------------------------------------------------------------------

describe('Pipeline E2E — evenodd holes', () => {
  const srcDir = path.join(TEST_ICONS, 'material_icons', 'baseline');
  const names = ['barcode.svg', 'qrcode.svg'];
  let res: RunResult;

  beforeAll(async () => {
    res = await runOnSubset({
      fontFamily: 'FeatEvenodd',
      icons: names.map((name) => ({ srcDir, name })),
    });
  }, 180_000);

  afterAll(() => cleanup(res?.outputDir, res?.tempDir));

  test('evenodd icons survive conversion (present with ≥1 layer)', () => {
    for (const name of names) {
      const entry = res.glyphmap.i[path.parse(name).name];
      expect(entry).toBeDefined();
      expect(entry![0]).toBeGreaterThan(0);
      expect(entry![1].length).toBeGreaterThanOrEqual(1);
    }
  });

  test('compiled font contains a multi-contour glyph (holes/bars preserved)', () => {
    const { Font } =
      require('fonteditor-core') as typeof import('fonteditor-core');
    const font = Font.create(fs.readFileSync(res.ttfPath), { type: 'ttf' });
    const glyf = font.get().glyf ?? [];

    const maxContours = Math.max(
      0,
      ...glyf.map((g) => (g.contours ? g.contours.length : 0))
    );
    expect(maxContours).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Mask rejection — unsupported icon skipped, valid sibling kept
// ---------------------------------------------------------------------------

describe('Pipeline E2E — mask rejection', () => {
  let res: RunResult;
  const warnings: string[] = [];

  beforeAll(async () => {
    res = await runOnSubset({
      fontFamily: 'FeatMask',
      icons: [
        { srcDir: path.join(TEST_ICONS, 'mask'), name: 'Avatar.svg' },
        {
          srcDir: path.join(TEST_ICONS, 'swm_icons', 'outline'),
          name: 'Key.svg',
        },
      ],
      onWarn: (msg) => warnings.push(msg),
    });
  }, 180_000);

  afterAll(() => cleanup(res?.outputDir, res?.tempDir));

  test('masked icon is skipped while the valid icon is kept', () => {
    expect(res.glyphmap.i).not.toHaveProperty('Avatar');
    expect(res.glyphmap.i).toHaveProperty('Key');
  });

  test('a warning explains the mask rejection', () => {
    expect(warnings.some((w) => /mask/i.test(w))).toBe(true);
  });
});
