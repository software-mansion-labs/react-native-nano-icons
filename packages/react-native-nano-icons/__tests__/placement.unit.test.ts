/** @jest-environment node */

import { computePlacement, transformPathForFont } from '../src/core/svg/layers';
import type { PathKitModule } from '../src/core/types';
import { loadPathKit, flattenContours, signedArea } from './helpers/geometry';

const UPM = 1000;
const SAFE_ZONE = 800;

function placement(viewBox: [number, number, number, number]) {
  return computePlacement({ upm: UPM, safeZone: SAFE_ZONE, viewBox });
}

describe('computePlacement() unit tests', () => {
  test('scale fits height for a square viewBox', () => {
    const { scale } = placement([0, 0, 24, 24]);
    expect(scale).toBeCloseTo(SAFE_ZONE / 24);
  });

  test('wide viewBox produces a larger advance width than square', () => {
    const wide = placement([0, 0, 48, 24]);
    const square = placement([0, 0, 24, 24]);
    expect(wide.adv).toBeGreaterThan(square.adv);
  });

  test('tall viewBox produces a smaller advance width than square', () => {
    const tall = placement([0, 0, 24, 48]);
    const square = placement([0, 0, 24, 24]);
    expect(tall.adv).toBeLessThan(square.adv);
  });

  test('zero-height viewBox does not throw (uses safeVh = 1)', () => {
    expect(() => placement([0, 0, 24, 0])).not.toThrow();
  });

  test('zero-width viewBox produces advance >= 1 (minimum advance guard)', () => {
    const { adv } = placement([0, 0, 0, 24]);
    expect(adv).toBeGreaterThanOrEqual(1);
  });

  test('viewBox offset is preserved in returned vx and vy', () => {
    const { vx, vy } = placement([10, 20, 24, 24]);
    expect(vx).toBe(10);
    expect(vy).toBe(20);
  });
});

describe('transformPathForFont()', () => {
  let PathKit: PathKitModule;

  beforeAll(async () => {
    PathKit = await loadPathKit();
  }, 60_000);

  // fills the viewBox → scaled to the 800 safe zone, padded 100 each side → [100,100,900,900]
  const VIEWBOX: [number, number, number, number] = [0, 0, 24, 24];
  const FULL_SQUARE = 'M0 0 H24 V24 H0 Z';

  function toFont(d: string, viewBox = VIEWBOX): string {
    const { vx, vy, scale, xOff, yOff } = computePlacement({
      upm: UPM,
      safeZone: SAFE_ZONE,
      viewBox,
    });
    return transformPathForFont(PathKit, d, {
      vx,
      vy,
      scale,
      xOff,
      yOff,
      upm: UPM,
    });
  }

  test('full-viewBox square maps to the centered [100,100,900,900] box', () => {
    const pts = flattenContours(PathKit, toFont(FULL_SQUARE)).flat();
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(100, 1);
    expect(Math.min(...ys)).toBeCloseTo(100, 1);
    expect(Math.max(...xs)).toBeCloseTo(900, 1);
    expect(Math.max(...ys)).toBeCloseTo(900, 1);
  });

  test('area scales to the safe-zone square (800×800 = 640000)', () => {
    const contours = flattenContours(PathKit, toFont(FULL_SQUARE));
    const area = contours.reduce((s, c) => s + Math.abs(signedArea(c)), 0);
    expect(area).toBeCloseTo(640000, -2);
  });

  test('Y axis is flipped: source top (y=0) maps above source bottom (y=24)', () => {
    const top = flattenContours(PathKit, toFont('M0 0 H24 V2 H0 Z')).flat();
    const bottom = flattenContours(
      PathKit,
      toFont('M0 22 H24 V24 H0 Z')
    ).flat();
    const topMeanY = top.reduce((s, p) => s + p[1], 0) / top.length;
    const bottomMeanY = bottom.reduce((s, p) => s + p[1], 0) / bottom.length;
    expect(topMeanY).toBeGreaterThan(bottomMeanY); // Y-up: source top sits higher
  });

  test('unparseable d string is returned unchanged', () => {
    expect(
      transformPathForFont(PathKit, '', {
        vx: 0,
        vy: 0,
        scale: 1,
        xOff: 0,
        yOff: 0,
        upm: UPM,
      })
    ).toBe('');
  });
});
