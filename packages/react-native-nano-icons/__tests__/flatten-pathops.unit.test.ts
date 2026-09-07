/** @jest-environment node */

import { createPathOps, type PathOps } from '../src/core/svg/flatten/pathops';
import { parseSvgPath, buildD, asCmdSeq } from '../src/core/svg/flatten/path';
import { Affine2D } from '../src/core/svg/flatten/transform';
import { loadPathKit } from './helpers/geometry';

let ops: PathOps;

beforeAll(async () => {
  ops = createPathOps(await loadPathKit());
}, 60_000);

const rect = (x: number, y: number, w: number, h: number) =>
  parseSvgPath(
    `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`,
    true
  );

describe('boolean ops', () => {
  test('union of overlapping rects', () => {
    const merged = ops.union(
      [rect(0, 0, 10, 10), rect(5, 0, 10, 10)],
      ['nonzero', 'nonzero']
    );
    expect(ops.pathArea(merged, 'nonzero')).toBeCloseTo(150, 6);
    const box = ops.boundingBox(merged);
    expect(box).toEqual([0, 0, 15, 10]);
  });

  test('intersection of overlapping rects', () => {
    const clipped = ops.intersection(
      [rect(0, 0, 10, 10), rect(5, 0, 10, 10)],
      ['nonzero', 'nonzero']
    );
    expect(ops.pathArea(clipped, 'nonzero')).toBeCloseTo(50, 6);
    expect(ops.boundingBox(clipped)).toEqual([5, 0, 10, 10]);
  });

  test('difference of overlapping rects', () => {
    const cut = ops.difference(
      [rect(0, 0, 10, 10), rect(5, 0, 10, 10)],
      ['nonzero', 'nonzero']
    );
    expect(ops.pathArea(cut, 'nonzero')).toBeCloseTo(50, 6);
    expect(ops.boundingBox(cut)).toEqual([0, 0, 5, 10]);
  });

  test('single input still gets simplified (for/else in picosvg)', () => {
    // two identical overlapping subpaths collapse to one
    const doubled = [...rect(0, 0, 10, 10), ...rect(0, 0, 10, 10)];
    const merged = ops.union([doubled], ['nonzero']);
    expect(ops.pathArea(merged, 'nonzero')).toBeCloseTo(100, 6);
    const moveCount = merged.filter(([c]) => c === 'M').length;
    expect(moveCount).toBe(1);
  });

  test('empty input yields empty output', () => {
    expect(ops.union([], [])).toEqual([]);
  });
});

describe('removeOverlaps', () => {
  test('evenodd ring keeps its hole contour', () => {
    // outer 10x10 with inner 4x4, both CW: evenodd -> ring with hole.
    // pathArea sums |area| per contour, so a preserved ring reads 100 + 16.
    const ring = [...rect(0, 0, 10, 10), ...rect(3, 3, 4, 4)];
    const simplified = ops.removeOverlaps(ring, 'evenodd');
    expect(ops.pathArea(simplified, 'nonzero')).toBeCloseTo(116, 6);
    const moveCount = simplified.filter(([c]) => c === 'M').length;
    expect(moveCount).toBe(2);
  });

  test('nonzero same-winding rects merge instead', () => {
    const ring = [...rect(0, 0, 10, 10), ...rect(3, 3, 4, 4)];
    const simplified = ops.removeOverlaps(ring, 'nonzero');
    expect(ops.pathArea(simplified, 'nonzero')).toBeCloseTo(100, 6);
  });
});

describe('transformCmds', () => {
  test('scale and translate', () => {
    const moved = ops.transformCmds(
      rect(0, 0, 10, 10),
      Affine2D.fromString('translate(5 5) scale(2)')
    );
    expect(ops.boundingBox(moved)).toEqual([5, 5, 25, 25]);
  });
});

describe('strokeCmds', () => {
  test('stroked line has area, unstroked has none', () => {
    const line = asCmdSeq('M0,5 L10,5');
    expect(ops.pathArea(line, 'nonzero')).toBe(0);
    const stroked = ops.strokeCmds(line, 'butt', 'miter', 2, 4, 0.1);
    expect(ops.pathArea(stroked, 'nonzero')).toBeCloseTo(20, 1);
    const box = ops.boundingBox(stroked);
    expect(box[1]).toBeCloseTo(4, 6);
    expect(box[3]).toBeCloseTo(6, 6);
  });

  test('unknown cap rejects', () => {
    expect(() =>
      ops.strokeCmds(asCmdSeq('M0,0 L1,1'), 'weird', 'miter', 1, 4, 0.1)
    ).toThrow('Unsupported cap');
  });

  test('round-trips through buildD/parseSvgPath', () => {
    const stroked = ops.strokeCmds(
      asCmdSeq('M0,5 L10,5'),
      'round',
      'round',
      2,
      4,
      0.1
    );
    const d = buildD(stroked);
    expect(parseSvgPath(d, true).length).toBe(stroked.length);
  });
});
