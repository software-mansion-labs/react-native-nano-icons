// reduce a path `d` to a shape fingerprint (area/bbox/contours)
// tests compare shape rather than float formatting, as latter may differ between impl

import { PathKitManager } from '../../src/core/pipeline/managers';
import type { PathKitModule, Point } from '../../src/core/types';

export async function loadPathKit(): Promise<PathKitModule> {
  return PathKitManager.getInstance();
}

type Verbs = {
  MOVE: number;
  LINE: number;
  QUAD: number;
  CONIC: number;
  CUBIC: number;
  CLOSE: number;
};

function verbs(PathKit: PathKitModule): Verbs {
  return {
    MOVE: PathKit.MOVE_VERB ?? 0,
    LINE: PathKit.LINE_VERB ?? 1,
    QUAD: PathKit.QUAD_VERB ?? 2,
    CONIC: PathKit.CONIC_VERB ?? 3,
    CUBIC: PathKit.CUBIC_VERB ?? 4,
    CLOSE: PathKit.CLOSE_VERB ?? 5,
  };
}

export function flattenContours(
  PathKit: PathKitModule,
  d: string,
  steps = 24
): Point[][] {
  const p = PathKit.FromSVGString(d);
  if (!p) return [];
  const cmds = p.toCmds();
  p.delete?.();

  const V = verbs(PathKit);
  const contours: Point[][] = [];
  let cur: Array<[number, number]> = [];
  let cx = 0,
    cy = 0,
    sx = 0,
    sy = 0;

  const flush = () => {
    if (cur.length) contours.push(cur as unknown as Point[]);
    cur = [];
  };

  for (const cmd of cmds) {
    const v = cmd[0]!;
    if (v === V.MOVE) {
      flush();
      cx = sx = cmd[1]!;
      cy = sy = cmd[2]!;
      cur.push([cx, cy]);
    } else if (v === V.LINE) {
      cx = cmd[1]!;
      cy = cmd[2]!;
      cur.push([cx, cy]);
    } else if (v === V.QUAD) {
      const x1 = cmd[1]!,
        y1 = cmd[2]!,
        x2 = cmd[3]!,
        y2 = cmd[4]!;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        cur.push([
          mt * mt * cx + 2 * mt * t * x1 + t * t * x2,
          mt * mt * cy + 2 * mt * t * y1 + t * t * y2,
        ]);
      }
      cx = x2;
      cy = y2;
    } else if (v === V.CUBIC) {
      const x1 = cmd[1]!,
        y1 = cmd[2]!,
        x2 = cmd[3]!,
        y2 = cmd[4]!,
        x3 = cmd[5]!,
        y3 = cmd[6]!;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        cur.push([
          mt * mt * mt * cx +
            3 * mt * mt * t * x1 +
            3 * mt * t * t * x2 +
            t * t * t * x3,
          mt * mt * mt * cy +
            3 * mt * mt * t * y1 +
            3 * mt * t * t * y2 +
            t * t * t * y3,
        ]);
      }
      cx = x3;
      cy = y3;
    } else if (v === V.CLOSE) {
      cx = sx;
      cy = sy;
    }
    // no conic handling — SVG `d` input never produces them
  }
  flush();
  return contours;
}

// shoelace; CCW > 0, CW < 0
export function signedArea(poly: Point[]): number {
  if (poly.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export type Fingerprint = {
  area: number;
  bbox: [number, number, number, number];
  contours: number;
};

function round(n: number, dp = 2): number {
  const m = 10 ** dp;
  return Math.round(n * m) / m;
}

// rounded so identical code snapshots byte-identically, a shape change moves the numbers
export function glyphFingerprint(
  PathKit: PathKitModule,
  d: string
): Fingerprint {
  const contours = flattenContours(PathKit, d);
  let area = 0;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;

  for (const poly of contours) {
    area += Math.abs(signedArea(poly));
    for (const [x, y] of poly) {
      if (x < left) left = x;
      if (y < top) top = y;
      if (x > right) right = x;
      if (y > bottom) bottom = y;
    }
  }

  const bbox: [number, number, number, number] = contours.length
    ? [round(left), round(top), round(right), round(bottom)]
    : [0, 0, 0, 0];

  return { area: round(area, 0), bbox, contours: contours.length };
}

export function fingerprintsMatch(
  a: Fingerprint,
  b: Fingerprint,
  tol: { areaRel?: number; bboxAbs?: number } = {}
): boolean {
  const areaRel = tol.areaRel ?? 0.01;
  const bboxAbs = tol.bboxAbs ?? 1;

  if (a.contours !== b.contours) return false;

  const areaBase = Math.max(1, Math.abs(a.area), Math.abs(b.area));
  if (Math.abs(a.area - b.area) / areaBase > areaRel) return false;

  for (let i = 0; i < 4; i++) {
    if (Math.abs(a.bbox[i]! - b.bbox[i]!) > bboxAbs) return false;
  }
  return true;
}
