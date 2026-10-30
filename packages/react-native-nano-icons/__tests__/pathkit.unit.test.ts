/** @jest-environment node */

import type { PathKitModule } from '../src/core/pathkit/types';
import {
  analyzeWinding,
  pathDataWithWinding,
} from '../src/core/pathkit/winding';
import { loadPathKit, flattenContours, signedArea } from './helpers/geometry';

let PathKit: PathKitModule;

beforeAll(async () => {
  PathKit = await loadPathKit();
}, 60_000);

const SQUARE = 'M0 0 H100 V100 H0 Z';
const SQUARE_REVERSED = 'M0 0 V100 H100 V0 Z';
const HOLE = 'M25 25 V75 H75 V25 Z';
const HOLE_REVERSED = 'M25 25 H75 V75 H25 Z';
const SIDE_SQUARE_REVERSED = 'M200 0 V100 H300 V0 Z';

const signs = (d: string) => analyzeWinding(PathKit, d)?.outerSigns ?? null;

describe('analyzeWinding', () => {
  test('a contour has the sign of its direction', () => {
    const [sign] = signs(SQUARE)!;
    expect(sign).not.toBe(0);
    expect(signs(SQUARE_REVERSED)).toEqual([-sign!]);
  });

  test('a hole turning against its outline has the outline sign', () => {
    const [sign] = signs(SQUARE)!;
    expect(signs(`${SQUARE} ${HOLE}`)).toEqual([sign, sign]);
  });

  test('separate outlines keep their own signs', () => {
    const [sign] = signs(SQUARE)!;
    expect(signs(`${SQUARE} ${SIDE_SQUARE_REVERSED}`)).toEqual([sign, -sign!]);
  });

  test('a hole turning with its outline cannot be analysed', () => {
    expect(signs(`${SQUARE} ${HOLE_REVERSED}`)).toBeNull();
  });

  test('crossing contours cannot be analysed', () => {
    expect(signs(`${SQUARE} M50 50 H150 V150 H50 Z`)).toBeNull();
  });

  test('an empty path cannot be analysed', () => {
    expect(signs('')).toBeNull();
  });
});

describe('pathDataWithWinding', () => {
  const areas = (d: string) => flattenContours(PathKit, d).map(signedArea);

  test('keeps a path that already has the sign', () => {
    const d = `${SQUARE} ${HOLE}`;
    const analysis = analyzeWinding(PathKit, d)!;
    expect(
      pathDataWithWinding(PathKit, d, analysis, analysis.outerSigns[0] as 1)
    ).toBe(d);
  });

  test('reverses every contour for the opposite sign', () => {
    const d = `${SQUARE} ${HOLE}`;
    const analysis = analyzeWinding(PathKit, d)!;
    const flipped = pathDataWithWinding(
      PathKit,
      d,
      analysis,
      -analysis.outerSigns[0]! as 1
    );
    expect(areas(flipped)).toEqual(areas(d).map((a) => -a));
  });

  test('reverses only the outlines with the other sign', () => {
    const d = `${SQUARE} ${SIDE_SQUARE_REVERSED}`;
    const analysis = analyzeWinding(PathKit, d)!;
    const sign = analysis.outerSigns[0] as 1;
    const out = pathDataWithWinding(PathKit, d, analysis, sign);
    expect(analyzeWinding(PathKit, out)!.outerSigns).toEqual([sign, sign]);
    expect(areas(out).map(Math.abs)).toEqual(areas(d).map(Math.abs));
  });
});
