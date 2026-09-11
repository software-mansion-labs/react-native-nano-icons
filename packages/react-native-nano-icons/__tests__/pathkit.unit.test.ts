/** @jest-environment node */

import { convertEvenoddToWinding } from '../src/core/pathkit/evenodd';
import type { PathKitModule } from '../src/core/pathkit/types';
import { loadPathKit, flattenContours, signedArea } from './helpers/geometry';

let PathKit: PathKitModule;

beforeAll(async () => {
  PathKit = await loadPathKit();
}, 60_000);

describe('convertEvenoddToWinding', () => {
  // 0..100 square with a 25..75 hole, evenodd
  const SQUARE_WITH_HOLE = 'M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z';

  test('preserves two contours (outer + hole survive)', () => {
    const out = convertEvenoddToWinding(PathKit, SQUARE_WITH_HOLE);
    expect(flattenContours(PathKit, out).length).toBe(2);
  });

  test('outer and hole end up with opposite winding signs', () => {
    const out = convertEvenoddToWinding(PathKit, SQUARE_WITH_HOLE);
    const signs = flattenContours(PathKit, out).map((c) =>
      Math.sign(signedArea(c))
    );
    // opposite winding is what makes the hole render under nonzero fill
    expect(new Set(signs).size).toBe(2);
  });

  test('bounding box is unchanged by the conversion', () => {
    const out = convertEvenoddToWinding(PathKit, SQUARE_WITH_HOLE);
    const pts = flattenContours(PathKit, out).flat();
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(0, 1);
    expect(Math.min(...ys)).toBeCloseTo(0, 1);
    expect(Math.max(...xs)).toBeCloseTo(100, 1);
    expect(Math.max(...ys)).toBeCloseTo(100, 1);
  });

  test('a simple hole-free square keeps a single contour and its area', () => {
    const out = convertEvenoddToWinding(PathKit, 'M0 0 H100 V100 H0 Z');
    const contours = flattenContours(PathKit, out);
    expect(contours.length).toBe(1);
    expect(Math.abs(signedArea(contours[0]!))).toBeCloseTo(10000, 0);
  });

  test('returns a string for an unparseable d', () => {
    expect(typeof convertEvenoddToWinding(PathKit, '')).toBe('string');
  });
});
