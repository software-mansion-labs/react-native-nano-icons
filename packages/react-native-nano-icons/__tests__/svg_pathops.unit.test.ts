/** @jest-environment node */

import path from 'node:path';

process.env.NANO_PACKAGE_ROOT = path.resolve(__dirname, '..');

import {
  buildPathopsBackend,
  convertEvenoddToWinding,
} from '../src/core/svg/svg_pathops';
import type { PathKitModule, WrappedPath } from '../src/core/types';
import { loadPathKit, flattenContours, signedArea } from './helpers/geometry';

let PathKit: PathKitModule;
let ops: ReturnType<typeof buildPathopsBackend>;

beforeAll(async () => {
  PathKit = await loadPathKit();
  ops = buildPathopsBackend(PathKit);
}, 60_000);

function rect(x: number, y: number, w: number, h: number): WrappedPath {
  const p = ops.create_path(0); // 0 = winding
  ops.move_to(p, x, y);
  ops.line_to(p, x + w, y);
  ops.line_to(p, x + w, y + h);
  ops.line_to(p, x, y + h);
  ops.close(p);
  return p;
}

describe('buildPathopsBackend — area & bounds', () => {
  test('area of a 100×100 square is ~10000', () => {
    const r = rect(0, 0, 100, 100);
    expect(ops.area(r)).toBeCloseTo(10000, 0);
    ops.delete_path(r);
  });

  test('bounds of a square are its extents [l,t,r,b]', () => {
    const r = rect(10, 20, 100, 50);
    const [l, t, rr, b] = ops.bounds(r);
    expect(l).toBeCloseTo(10, 3);
    expect(t).toBeCloseTo(20, 3);
    expect(rr).toBeCloseTo(110, 3);
    expect(b).toBeCloseTo(70, 3);
    ops.delete_path(r);
  });
});

describe('buildPathopsBackend — boolean ops (op)', () => {
  // A and B overlap in a 50×50 corner = 2500.
  test('UNION area = A + B − overlap = 17500', () => {
    const a = rect(0, 0, 100, 100);
    const b = rect(50, 50, 100, 100);
    const out = ops.op(a, b, 0)!;
    expect(out).not.toBeNull();
    expect(ops.area(out)).toBeCloseTo(17500, -1);
    ops.delete_path(a);
    ops.delete_path(b);
    ops.delete_path(out);
  });

  test('INTERSECT area = overlap = 2500', () => {
    const a = rect(0, 0, 100, 100);
    const b = rect(50, 50, 100, 100);
    const out = ops.op(a, b, 1)!;
    expect(ops.area(out)).toBeCloseTo(2500, -1);
    ops.delete_path(a);
    ops.delete_path(b);
    ops.delete_path(out);
  });

  test('DIFFERENCE area = A − overlap = 7500', () => {
    const a = rect(0, 0, 100, 100);
    const b = rect(50, 50, 100, 100);
    const out = ops.op(a, b, 2)!;
    expect(ops.area(out)).toBeCloseTo(7500, -1);
    ops.delete_path(a);
    ops.delete_path(b);
    ops.delete_path(out);
  });
});

describe('buildPathopsBackend — transform', () => {
  test('uniform 2× scale quadruples area and doubles bounds', () => {
    const r = rect(0, 0, 100, 100);
    const scaled = ops.transform(r, 2, 0, 0, 2, 0, 0); // a,b,c,d,e,f
    expect(ops.area(scaled)).toBeCloseTo(40000, -1);
    const [, , rr, b] = ops.bounds(scaled);
    expect(rr).toBeCloseTo(200, 2);
    expect(b).toBeCloseTo(200, 2);
    ops.delete_path(r);
    ops.delete_path(scaled);
  });

  test('translate shifts bounds without changing area', () => {
    const r = rect(0, 0, 100, 100);
    const moved = ops.transform(r, 1, 0, 0, 1, 30, 40);
    const [l, t] = ops.bounds(moved);
    expect(l).toBeCloseTo(30, 2);
    expect(t).toBeCloseTo(40, 2);
    expect(ops.area(moved)).toBeCloseTo(10000, 0);
    ops.delete_path(r);
    ops.delete_path(moved);
  });
});

describe('buildPathopsBackend — fill type', () => {
  test('get/set fill type round-trips (0 winding, 1 evenodd)', () => {
    const r = rect(0, 0, 10, 10);
    ops.set_fill_type(r, 1);
    expect(ops.get_fill_type(r)).toBe(1);
    ops.set_fill_type(r, 0);
    expect(ops.get_fill_type(r)).toBe(0);
    ops.delete_path(r);
  });
});

describe('buildPathopsBackend — stroke', () => {
  test('stroking a zero-area line yields a positive-area outline', () => {
    const p = ops.create_path(0);
    ops.move_to(p, 0, 0);
    ops.line_to(p, 100, 0);
    const stroked = ops.stroke(p, 10, 0, 0, 4, [], 0); // width, butt cap, miter join
    expect(ops.area(stroked)).toBeGreaterThan(0);
    ops.delete_path(p);
    ops.delete_path(stroked);
  });
});

describe('buildPathopsBackend — iter_segments', () => {
  test('a square emits MOVE then LINEs then CLOSE', () => {
    const r = rect(0, 0, 100, 100);
    const segs = ops.iter_segments(r);
    expect(segs.length).toBeGreaterThan(0);
    expect(segs[0]![0]).toBe(0); // MOVE
    expect(segs.map((s) => s[0])).toContain(4); // CLOSE
    ops.delete_path(r);
  });
});

describe('buildPathopsBackend — clone_path', () => {
  test('clone has identical area to the original', () => {
    const r = rect(0, 0, 100, 100);
    const c = ops.clone_path(r);
    expect(ops.area(c)).toBeCloseTo(ops.area(r), 0);
    ops.delete_path(r);
    ops.delete_path(c);
  });
});

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
