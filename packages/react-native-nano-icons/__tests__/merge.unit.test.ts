/** @jest-environment node */

import path from 'node:path';

import { mergeSameColorPaths } from '../src/core/glyph/merge';
import {
  approxSignedAreaFromContourCmds,
  orientedContours,
  verbMap,
} from '../src/core/pathkit/contours';
import type { ParsedPath } from '../src/core/glyph/parse';
import type { PathKitModule } from '../src/core/pathkit/types';
import { prepareSvgLayers } from '../src/core/pipeline/prepare';
import { loadPathKit } from './helpers/geometry';

let PathKit: PathKitModule;

beforeAll(async () => {
  PathKit = await loadPathKit();
}, 60_000);

function nonzeroArea(d: string): number {
  const p = PathKit.FromSVGString(d);
  if (!p) return 0;
  p.simplify();
  const V = verbMap(PathKit);
  const total = orientedContours(p.toCmds(), V).reduce(
    (sum, c) => sum + approxSignedAreaFromContourCmds(c.cmds, V),
    0
  );
  p.delete?.();
  return Math.abs(total);
}

function drawnArea(paths: ParsedPath[]): number {
  const union = paths
    .map((p) => p.d)
    .reduce((acc, d) => {
      const a = PathKit.FromSVGString(acc)!;
      const b = PathKit.FromSVGString(d)!;
      const out = PathKit.MakeFromOp(a, b, PathKit.PathOp!.UNION!)!;
      const svg = out.toSVGString();
      a.delete?.();
      b.delete?.();
      out.delete?.();
      return svg;
    });
  return nonzeroArea(union);
}

function expectSameDrawing(before: ParsedPath[], after: ParsedPath[]) {
  const area = drawnArea(before);
  expect(drawnArea(after)).toBeCloseTo(area, 3);
  expect(drawnArea([...before, ...after])).toBeCloseTo(area, 3);
}

async function prepareFixture(file: string) {
  return (await prepareSvgLayers({
    filePath: path.join(__dirname, 'fixtures', file),
    fileLabel: file,
    pathkit: PathKit,
  }))!;
}

describe('same-colour paths of #91', () => {
  test('two squares wound opposite ways merge into their union', async () => {
    const { paths } = await prepareFixture('issue-91-two-squares.svg');
    expect(paths).toHaveLength(1);
    expect(nonzeroArea(paths[0]!.d)).toBeCloseTo(2 * 144 - 16, 3);
  });

  test('a bar across an even-odd frame keeps the frame where they cross', async () => {
    const { paths } = await prepareFixture('issue-91-evenodd-frame-bar.svg');
    expect(paths).toHaveLength(1);
    expect(nonzeroArea(paths[0]!.d)).toBeCloseTo(400 - 144 + 48 - 16, 3);
  });
});

describe('mergeSameColorPaths', () => {
  const square = (x: number) => `M${x} 0 H${x + 10} V10 H${x} Z`;
  const squareReversed = (x: number) => `M${x} 0 V10 H${x + 10} V0 Z`;

  test('paths wound the same way are joined as they are', () => {
    expect(
      mergeSameColorPaths(
        [
          { d: square(0), fill: 'red' },
          { d: square(20), fill: 'red' },
        ],
        PathKit
      )
    ).toEqual([{ d: `${square(0)} ${square(20)}`, fill: 'red' }]);
  });

  test('a path wound the other way is reversed before joining', () => {
    const [merged] = mergeSameColorPaths(
      [
        { d: square(0), fill: 'red' },
        { d: squareReversed(5), fill: 'red' },
      ],
      PathKit
    );
    expect(merged!.d.startsWith(`${square(0)} `)).toBe(true);
    expect(nonzeroArea(merged!.d)).toBeCloseTo(150, 3);
  });

  test('outlines of one path wound opposite ways are aligned before joining', () => {
    const [merged, ...rest] = mergeSameColorPaths(
      [
        { d: `${square(0)} ${squareReversed(20)}`, fill: 'red' },
        { d: square(25), fill: 'red' },
      ],
      PathKit
    );
    expect(rest).toEqual([]);
    expect(nonzeroArea(merged!.d)).toBeCloseTo(250, 3);
  });

  test('a path whose hole turns with its outline keeps its own layer', () => {
    const filledHole = `${square(0)} M2 2 H8 V8 H2 Z`;
    expect(
      mergeSameColorPaths(
        [
          { d: square(20), fill: 'red' },
          { d: filledHole, fill: 'red' },
          { d: square(40), fill: 'red' },
        ],
        PathKit
      )
    ).toEqual([
      { d: square(20), fill: 'red' },
      { d: filledHole, fill: 'red' },
      { d: square(40), fill: 'red' },
    ]);
  });

  test('bars crossing as a plus, wound opposite ways, keep their empty centre', () => {
    const paths = [
      { d: 'M2 9 H22 V15 H2 Z M9 2 V22 H15 V2 Z', fill: 'red' },
      { d: 'M0 0 H1 V1 H0 Z', fill: 'red' },
    ];
    expectSameDrawing(paths, mergeSameColorPaths(paths, PathKit));
  });

  test('a contour repeated with the opposite winding stays empty', () => {
    const paths = [
      { d: 'M2 2 H10 V10 H2 Z M2 2 V10 H10 V2 Z', fill: 'red' },
      { d: 'M20 20 H22 V22 H20 Z', fill: 'red' },
    ];
    expectSameDrawing(paths, mergeSameColorPaths(paths, PathKit));
  });

  test('a self-intersecting contour keeps both lobes', () => {
    const paths = [
      { d: 'M2 2 L20 14 V2 L2 8 Z', fill: 'red' },
      { d: 'M2 6 H6 V10 H2 Z', fill: 'red' },
    ];
    expectSameDrawing(paths, mergeSameColorPaths(paths, PathKit));
  });

  test('different colours are never joined', () => {
    expect(
      mergeSameColorPaths(
        [
          { d: square(0), fill: 'red' },
          { d: square(20), fill: 'blue' },
        ],
        PathKit
      )
    ).toHaveLength(2);
  });
});
