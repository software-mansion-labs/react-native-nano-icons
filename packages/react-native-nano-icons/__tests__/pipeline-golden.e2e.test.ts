/** @jest-environment node */

import fs from 'node:fs';

import type { NanoGlyphMap, PathKitModule } from '../src/core/types';
import { loadPathKit, glyphFingerprint } from './helpers/geometry';
import {
  CURATED,
  REJECTED,
  runOnIcons,
  cleanup,
  type RunResult,
} from './helpers/golden';

// The whole-pipeline guard: freeze the structural glyphmap and per-glyph
// geometry so the rewrite must reproduce identical fonts

const FONT_FAMILY = 'GoldenCurated';

// the input dir is flat and keyed by name
const ALL_INPUTS = [...CURATED, ...REJECTED].map((i) => ({
  abs: i.abs,
  file: `${i.feature}_${i.file}`,
  name: `${i.feature}_${i.name}`,
  expectRejected: i.expectRejected,
}));

let PathKit: PathKitModule;
let res: RunResult;

beforeAll(async () => {
  PathKit = await loadPathKit();
  res = await runOnIcons({
    fontFamily: FONT_FAMILY,
    icons: ALL_INPUTS.map((i) => ({ abs: i.abs, file: i.file })),
  });
}, 180_000);

afterAll(() => cleanup(res?.outputDir, res?.tempDir));

// glyphmap structure only - no coordinates
function structuralSummary(glyphmap: NanoGlyphMap) {
  const icons = Object.entries(glyphmap.i)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, [adv, layers]]) => ({
      name,
      adv,
      layerColors: layers.map(([, color]) => color),
    }));
  return { meta: glyphmap.m, icons };
}

describe('pipeline golden — structural summary (Tier S)', () => {
  test('curated icons produce a stable structural glyphmap', () => {
    expect(structuralSummary(res.glyphmap)).toMatchSnapshot();
  });

  test('rejected icons are absent, valid ones present', () => {
    for (const ic of REJECTED) {
      expect(res.glyphmap.i).not.toHaveProperty(`${ic.feature}_${ic.name}`);
    }
    expect(res.glyphmap.i).toHaveProperty('outline_Air');
    expect(res.glyphmap.i).toHaveProperty('outline_Alarm');
    expect(res.glyphmap.i).toHaveProperty('duotone_Alarm'); // multi-layer variant kept
  });

  test('a warning explains each rejection', () => {
    expect(res.warnings.some((w) => /mask/i.test(w))).toBe(true);
  });

  test('layer codepoints are sequential from startUnicode with no gaps', () => {
    const all: number[] = [];
    for (const [, layers] of Object.values(res.glyphmap.i)) {
      for (const [cp] of layers) all.push(cp);
    }
    all.sort((a, b) => a - b);
    expect(all[0]).toBe(0xe000);
    for (let i = 1; i < all.length; i++) {
      expect(all[i]).toBe(all[i - 1]! + 1);
    }
  });

  test('all advance widths are positive integers', () => {
    for (const [adv] of Object.values(res.glyphmap.i)) {
      expect(Number.isInteger(adv)).toBe(true);
      expect(adv).toBeGreaterThan(0);
    }
  });
});

describe('pipeline golden — glyph geometry', () => {
  test('compiled glyph outlines match their frozen fingerprints', () => {
    const { Font } =
      require('fonteditor-core') as typeof import('fonteditor-core');
    const font = Font.create(fs.readFileSync(res.ttfPath), { type: 'ttf' });
    const glyf = font.get().glyf ?? [];

    const shapes = glyf
      .filter((g) => (g.contours?.length ?? 0) > 0)
      .map((g) => ({
        unicode: g.unicode?.[0] ?? null,
        contourCount: g.contours!.length,
        d: contoursToD(g.contours!),
      }))
      .filter((g) => g.unicode !== null)
      .sort((a, b) => a.unicode! - b.unicode!)
      .map((g) => ({
        unicode: g.unicode,
        contourCount: g.contourCount,
        shape: glyphFingerprint(PathKit, g.d),
      }));

    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes).toMatchSnapshot();
  });
});

// TrueType contours (on/off-curve quad points) -> SVG `d` so we can fingerprint them
function contoursToD(
  contours: { x: number; y: number; onCurve: boolean }[][]
): string {
  const parts: string[] = [];
  for (const contour of contours) {
    if (contour.length === 0) continue;
    // no on-curve start point -> synthesize the midpoint of the first off-curve pair
    let startIdx = contour.findIndex((p) => p.onCurve);
    let start: { x: number; y: number };
    if (startIdx === -1) {
      const a = contour[0]!;
      const b = contour[1] ?? contour[0]!;
      start = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      startIdx = 0;
    } else {
      start = contour[startIdx]!;
    }

    parts.push(`M${start.x} ${start.y}`);
    const n = contour.length;
    let i = 1;
    while (i <= n) {
      const cur = contour[(startIdx + i) % n]!;
      if (cur.onCurve) {
        parts.push(`L${cur.x} ${cur.y}`);
        i++;
      } else {
        const next = contour[(startIdx + i + 1) % n]!;
        const end = next.onCurve
          ? next
          : { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 };
        parts.push(`Q${cur.x} ${cur.y} ${end.x} ${end.y}`);
        i += next.onCurve ? 2 : 1;
      }
    }
    parts.push('Z');
  }
  return parts.join(' ');
}
