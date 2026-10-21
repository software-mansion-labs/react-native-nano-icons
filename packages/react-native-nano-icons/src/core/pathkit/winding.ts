import type { Cmd, PathKitModule, PathKitPath, Point, VerbMap } from './types';
import {
  approxSignedAreaFromContourCmds,
  cmdsToPathData,
  contourToPolyline,
  ensureClosed,
  orientedContours,
  pointInPolygon,
  reverseClosedContourKeepStart,
  splitContours,
  verbMap,
  type Contour,
} from './contours';

function conicsToCubics(cmds: readonly Cmd[], V: VerbMap): Cmd[] {
  let x = 0;
  let y = 0;
  return cmds.map((cmd) => {
    const verb = cmd[0]!;
    if (verb === V.CONIC) {
      const [, cx, cy, ex, ey, w] = cmd as number[];
      const k = (4 * w!) / (3 * (1 + w!));
      const out: Cmd = [
        V.CUBIC,
        x + k * (cx! - x),
        y + k * (cy! - y),
        ex! + k * (cx! - ex!),
        ey! + k * (cy! - ey!),
        ex!,
        ey!,
      ];
      x = ex!;
      y = ey!;
      return out;
    }
    if (verb !== V.CLOSE) {
      x = cmd[cmd.length - 2]!;
      y = cmd[cmd.length - 1]!;
    }
    return cmd;
  });
}

function orientedContoursOf(
  PathKit: PathKitModule,
  path: PathKitPath
): Contour[] {
  path.simplify();
  const V = verbMap(PathKit);
  return orientedContours(conicsToCubics(path.toCmds(), V), V);
}

export function orientedPathData(
  PathKit: PathKitModule,
  path: PathKitPath
): string {
  return cmdsToPathData(
    orientedContoursOf(PathKit, path).flatMap((c) => c.cmds),
    verbMap(PathKit)
  );
}

export function canonicalWinding(PathKit: PathKitModule, d: string): string {
  const path = PathKit.FromSVGString(d);
  if (!path) return d;
  const out = orientedPathData(PathKit, path);
  path.delete?.();
  return out;
}

export function reversedWinding(PathKit: PathKitModule, d: string): string {
  const path = PathKit.FromSVGString(d);
  if (!path) return d;
  const V = verbMap(PathKit);
  const contours = orientedContoursOf(PathKit, path);
  path.delete?.();
  return cmdsToPathData(
    contours.flatMap((c) =>
      reverseClosedContourKeepStart(c.cmds, c.explicitCloseWanted, V)
    ),
    V
  );
}

const BOUNDARY_TOLERANCE = 2e-3;

type Box = [minX: number, minY: number, maxX: number, maxY: number];

function boxOf(points: readonly Point[]): Box {
  let box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    box = [
      Math.min(box[0], x),
      Math.min(box[1], y),
      Math.max(box[2], x),
      Math.max(box[3], y),
    ];
  }
  return box;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq)
        );
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function onBoundary(p: Point, polygon: readonly Point[]): boolean {
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (distanceToSegment(p, polygon[j]!, polygon[i]!) <= BOUNDARY_TOLERANCE) {
      return true;
    }
  }
  return false;
}

type Outline = { area: number; polygon: Point[]; box: Box };

function relation(
  inner: Outline,
  outer: Outline
): 'inside' | 'outside' | 'crossing' {
  if (!boxesOverlap(inner.box, outer.box)) return 'outside';
  let inside = 0;
  let outside = 0;
  for (const p of inner.polygon) {
    if (onBoundary(p, outer.polygon)) continue;
    if (pointInPolygon(p[0], p[1], outer.polygon)) inside++;
    else outside++;
    if (inside > 0 && outside > 0) return 'crossing';
  }
  return inside > 0 ? 'inside' : 'outside';
}

export type WindingAnalysis = {
  contours: Cmd[][];
  outerSigns: (-1 | 0 | 1)[];
};

export function analyzeWinding(
  PathKit: PathKitModule,
  d: string
): WindingAnalysis | null {
  const path = PathKit.FromSVGString(d);
  if (!path) return null;
  const V = verbMap(PathKit);
  const contours = splitContours(conicsToCubics(path.toCmds(), V), V);
  path.delete?.();

  const outlines = contours.map((contour): Outline | null => {
    const closed = ensureClosed(contour, V);
    const area = approxSignedAreaFromContourCmds(closed, V);
    if (area === 0) return null;
    const polygon = contourToPolyline(closed, V);
    return { area, polygon, box: boxOf(polygon) };
  });

  const outerSigns: (-1 | 0 | 1)[] = [];
  const parents: (number | null)[] = [];
  for (const [i, outline] of outlines.entries()) {
    if (!outline) {
      outerSigns.push(0);
      parents.push(null);
      continue;
    }
    let depth = 0;
    let parent: number | null = null;
    for (const [j, other] of outlines.entries()) {
      if (!other || j === i) continue;
      const r = relation(outline, other);
      if (r === 'crossing') return null;
      if (r === 'inside') {
        depth++;
        if (
          parent === null ||
          Math.abs(other.area) < Math.abs(outlines[parent]!.area)
        ) {
          parent = j;
        }
      }
    }
    outerSigns.push(
      (Math.sign(outline.area) * (depth % 2 === 0 ? 1 : -1)) as -1 | 1
    );
    parents.push(parent);
  }

  for (const [i, parent] of parents.entries()) {
    if (parent !== null && outerSigns[i] !== outerSigns[parent]) return null;
  }
  if (outerSigns.every((sign) => sign === 0)) return null;
  return { contours, outerSigns };
}

function reversedContour(contour: readonly Cmd[], V: VerbMap): Cmd[] {
  const drawn = contour.filter((cmd) => cmd[0] !== V.CLOSE);
  const ends = drawn.map((cmd) => cmd.slice(-2));
  const out: Cmd[] = [[V.MOVE, ...ends[ends.length - 1]!]];
  for (let i = drawn.length - 1; i >= 1; i--) {
    const cmd = drawn[i]!;
    const start = ends[i - 1]!;
    if (cmd[0] === V.LINE) out.push([V.LINE, ...start]);
    else if (cmd[0] === V.QUAD) out.push([V.QUAD, cmd[1]!, cmd[2]!, ...start]);
    else if (cmd[0] === V.CUBIC) {
      out.push([V.CUBIC, cmd[3]!, cmd[4]!, cmd[1]!, cmd[2]!, ...start]);
    }
  }
  if (drawn.length < contour.length) out.push([V.CLOSE]);
  return out;
}

export function pathDataWithWinding(
  PathKit: PathKitModule,
  d: string,
  analysis: WindingAnalysis,
  sign: -1 | 1
): string {
  const { contours, outerSigns } = analysis;
  if (outerSigns.every((s) => s === 0 || s === sign)) return d;
  const V = verbMap(PathKit);
  return cmdsToPathData(
    contours.flatMap((contour, i) =>
      outerSigns[i] === -sign ? reversedContour(contour, V) : contour
    ),
    V
  );
}
