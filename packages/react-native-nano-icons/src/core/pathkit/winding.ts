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

function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return (
    a[0] <= b[2] + margin &&
    b[0] <= a[2] + margin &&
    a[1] <= b[3] + margin &&
    b[1] <= a[3] + margin
  );
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

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  if (
    Math.sign(cross(a, b, c)) * Math.sign(cross(a, b, d)) < 0 &&
    Math.sign(cross(c, d, a)) * Math.sign(cross(c, d, b)) < 0
  ) {
    return true;
  }
  return (
    distanceToSegment(a, c, d) <= BOUNDARY_TOLERANCE ||
    distanceToSegment(b, c, d) <= BOUNDARY_TOLERANCE ||
    distanceToSegment(c, a, b) <= BOUNDARY_TOLERANCE ||
    distanceToSegment(d, a, b) <= BOUNDARY_TOLERANCE
  );
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function ringOf(polyline: readonly Point[]): Point[] {
  const ring: Point[] = [];
  for (const p of polyline) {
    const last = ring[ring.length - 1];
    if (!last || distance(p, last) > BOUNDARY_TOLERANCE) ring.push(p);
  }
  if (
    ring.length > 1 &&
    distance(ring[0]!, ring[ring.length - 1]!) <= BOUNDARY_TOLERANCE
  ) {
    ring.pop();
  }
  return ring;
}

type Edge = { ring: number; index: number; a: Point; b: Point; box: Box };

function contoursTouch(rings: readonly Point[][]): boolean {
  const edges: Edge[] = [];
  for (const [ring, points] of rings.entries()) {
    if (points.length < 3) continue;
    for (const [index, a] of points.entries()) {
      const b = points[(index + 1) % points.length]!;
      edges.push({ ring, index, a, b, box: boxOf([a, b]) });
    }
  }
  edges.sort((e, f) => e.box[0] - f.box[0]);

  const adjacent = (e: Edge, f: Edge) => {
    if (e.ring !== f.ring) return false;
    const gap = Math.abs(e.index - f.index);
    return gap === 1 || gap === rings[e.ring]!.length - 1;
  };
  for (const [i, edge] of edges.entries()) {
    for (let j = i + 1; j < edges.length; j++) {
      const other = edges[j]!;
      if (other.box[0] > edge.box[2] + BOUNDARY_TOLERANCE) break;
      if (
        boxesOverlap(edge.box, other.box, BOUNDARY_TOLERANCE) &&
        !adjacent(edge, other) &&
        segmentsTouch(edge.a, edge.b, other.a, other.b)
      ) {
        return true;
      }
    }
  }
  return false;
}

type Outline = { area: number; polygon: Point[]; box: Box };

function isInside(inner: Outline, outer: Outline): boolean {
  if (!boxesOverlap(inner.box, outer.box)) return false;
  const [x, y] = inner.polygon[0]!;
  return pointInPolygon(x, y, outer.polygon);
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

  const closed = contours.map((contour) => ensureClosed(contour, V));
  const rings = closed.map((contour) => ringOf(contourToPolyline(contour, V)));
  if (contoursTouch(rings)) return null;

  const outlines = closed.map((contour, i): Outline | null => {
    const area = approxSignedAreaFromContourCmds(contour, V);
    if (area === 0) return null;
    const polygon = rings[i]!;
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
      if (isInside(outline, other)) {
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
