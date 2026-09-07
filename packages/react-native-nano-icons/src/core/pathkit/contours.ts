import type { Cmd, PathKitModule, Point, VerbMap } from './types';

export function verbMap(PathKit: PathKitModule): VerbMap {
  return {
    MOVE: PathKit.MOVE_VERB ?? 0,
    LINE: PathKit.LINE_VERB ?? 1,
    QUAD: PathKit.QUAD_VERB ?? 2,
    CONIC: PathKit.CONIC_VERB ?? 3,
    CUBIC: PathKit.CUBIC_VERB ?? 4,
    CLOSE: PathKit.CLOSE_VERB ?? 5,
  };
}

export function fillTypes(PathKit: PathKitModule): {
  EVENODD: number;
  WINDING: number;
} {
  return {
    EVENODD: PathKit?.FillType?.EVENODD ?? PathKit?.FillType?.EVEN_ODD ?? 1,
    WINDING: PathKit?.FillType?.WINDING ?? PathKit?.FillType?.NONZERO ?? 0,
  };
}

const EPS = 1e-2;

// ✅ round-half-to-even (banker's rounding) at ndigits
export function roundN(x: number, ndigits = 3): number {
  const m = 10 ** ndigits;
  const s = x * m;

  // Handle very large values safely
  if (!Number.isFinite(s)) return x;

  const floor = Math.floor(s);
  const frac = s - floor;

  // floating tolerance for "exactly .5"
  const TIE_EPS = 1e-12;

  let roundedInt: number;
  if (Math.abs(frac - 0.5) < TIE_EPS) {
    // tie -> choose even
    roundedInt = floor % 2 === 0 ? floor : floor + 1;
  } else if (Math.abs(frac + 0.5) < TIE_EPS) {
    // negative tie case (rare due to floor behavior, but keep for completeness)
    const ceil = Math.ceil(s);
    roundedInt = ceil % 2 === 0 ? ceil : ceil - 1;
  } else {
    roundedInt = Math.round(s);
  }

  return roundedInt / m;
}

export function normPt(p: Point): [number, number] {
  return [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000];
}

export function eqPt(a: Point, b: Point): boolean {
  const aa = normPt(a);
  const bb = normPt(b);
  return Math.abs(aa[0] - bb[0]) < EPS && Math.abs(aa[1] - bb[1]) < EPS;
}

function signedAreaPolyline(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function approxSignedAreaFromContourCmds(
  contourCmds: readonly Cmd[],
  VERB: VerbMap,
  steps = 24
): number {
  let cx = 0,
    cy = 0;
  let sx = 0,
    sy = 0;
  const pts: Point[] = [];
  const add = (x: number, y: number) => pts.push([x, y]);

  for (const cmd of contourCmds) {
    const v = cmd[0]!;
    if (v === VERB.MOVE) {
      cx = cmd[1]!;
      cy = cmd[2]!;
      sx = cx;
      sy = cy;
      add(cx, cy);
    } else if (v === VERB.LINE) {
      cx = cmd[1]!;
      cy = cmd[2]!;
      add(cx, cy);
    } else if (v === VERB.QUAD) {
      const x0 = cx,
        y0 = cy;
      const x1 = cmd[1]!,
        y1 = cmd[2]!;
      const x2 = cmd[3]!,
        y2 = cmd[4]!;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        const x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
        const y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
        add(x, y);
      }
      cx = x2;
      cy = y2;
    } else if (v === VERB.CUBIC) {
      const x0 = cx,
        y0 = cy;
      const x1 = cmd[1]!,
        y1 = cmd[2]!;
      const x2 = cmd[3]!,
        y2 = cmd[4]!;
      const x3 = cmd[5]!,
        y3 = cmd[6]!;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        const x =
          mt * mt * mt * x0 +
          3 * mt * mt * t * x1 +
          3 * mt * t * t * x2 +
          t * t * t * x3;
        const y =
          mt * mt * mt * y0 +
          3 * mt * mt * t * y1 +
          3 * mt * t * t * y2 +
          t * t * t * y3;
        add(x, y);
      }
      cx = x3;
      cy = y3;
    } else if (v === VERB.CLOSE) {
      add(sx, sy);
    }
  }

  if (
    pts.length &&
    (pts[0]![0] !== pts[pts.length - 1]![0] ||
      pts[0]![1] !== pts[pts.length - 1]![1])
  ) {
    pts.push([pts[0]![0], pts[0]![1]]);
  }
  return signedAreaPolyline(pts);
}

export function splitContours(cmds: readonly Cmd[], VERB: VerbMap): Cmd[][] {
  const contours: Cmd[][] = [];
  let cur: Cmd[] | null = null;
  for (const cmd of cmds) {
    const v = cmd[0]!;
    if (v === VERB.MOVE) {
      if (cur && cur.length) contours.push(cur);
      cur = [cmd];
    } else if (cur) {
      cur.push(cmd);
    }
  }
  if (cur && cur.length) contours.push(cur);
  return contours;
}

export function ensureClosed(
  contourCmds: readonly Cmd[],
  VERB: VerbMap
): Cmd[] {
  return contourCmds.some((c) => c[0] === VERB.CLOSE)
    ? [...contourCmds]
    : [...contourCmds, [VERB.CLOSE]];
}

export function explicitCloseWantedFromCmds(
  contourCmds: readonly Cmd[] | undefined,
  VERB: VerbMap
): boolean {
  if (!contourCmds?.length) return false;
  const m = contourCmds[0]!;
  if (m[0] !== VERB.MOVE) return false;
  const start: Point = [m[1]!, m[2]!];

  for (let i = contourCmds.length - 1; i >= 1; i--) {
    const cmd = contourCmds[i]!;
    const v = cmd[0]!;
    if (v === VERB.CLOSE) continue;

    let end: Point | null = null;
    if (v === VERB.LINE) end = [cmd[1]!, cmd[2]!];
    else if (v === VERB.QUAD) end = [cmd[3]!, cmd[4]!];
    else if (v === VERB.CUBIC) end = [cmd[5]!, cmd[6]!];
    else continue;

    return eqPt(end, start);
  }
  return false;
}

type SegmentL = { type: 'L'; start: Point; end: Point; synthetic: boolean };
type SegmentQ = {
  type: 'Q';
  start: Point;
  ctrl: Point;
  end: Point;
  synthetic: boolean;
};
type SegmentC = {
  type: 'C';
  start: Point;
  c1: Point;
  c2: Point;
  end: Point;
  synthetic: boolean;
};
type Segment = SegmentL | SegmentQ | SegmentC;

export function contourToSegments(
  contourCmds: readonly Cmd[],
  VERB: VerbMap
): { start: Point; segs: Segment[] } {
  const c = ensureClosed(contourCmds, VERB);
  const move = c[0]!;
  const sx = move[1]!,
    sy = move[2]!;

  let last: Point = [sx, sy];
  const segs: Segment[] = [];

  for (let i = 1; i < c.length; i++) {
    const cmd = c[i]!;
    const v = cmd[0]!;

    if (v === VERB.LINE) {
      const end: Point = [cmd[1]!, cmd[2]!];
      segs.push({ type: 'L', start: last, end, synthetic: false });
      last = end;
    } else if (v === VERB.QUAD) {
      const ctrl: Point = [cmd[1]!, cmd[2]!];
      const end: Point = [cmd[3]!, cmd[4]!];
      segs.push({ type: 'Q', start: last, ctrl, end, synthetic: false });
      last = end;
    } else if (v === VERB.CUBIC) {
      const c1: Point = [cmd[1]!, cmd[2]!];
      const c2: Point = [cmd[3]!, cmd[4]!];
      const end: Point = [cmd[5]!, cmd[6]!];
      segs.push({ type: 'C', start: last, c1, c2, end, synthetic: false });
      last = end;
    } else if (v === VERB.CLOSE) {
      const end: Point = [sx, sy];
      if (!eqPt(last, end)) {
        segs.push({ type: 'L', start: last, end, synthetic: true });
      }
      last = end;
    }
  }

  return { start: [sx, sy], segs };
}

function applyClosePolicy(
  segs: Segment[],
  startPt: Point,
  explicitCloseWanted: boolean
): Segment[] {
  if (!segs.length) return segs;

  for (const s of segs) s.synthetic = false;

  const last = segs[segs.length - 1]!;
  const lastEnd = last.end;
  if (!eqPt(lastEnd, startPt)) {
    segs.push({ type: 'L', start: lastEnd, end: startPt, synthetic: false });
  }

  if (!explicitCloseWanted) {
    segs[segs.length - 1]!.synthetic = true;
  }
  return segs;
}

function segmentsToContourCmds(
  startPt: Point,
  segs: readonly Segment[],
  VERB: VerbMap
): Cmd[] {
  const out: Cmd[] = [[VERB.MOVE, roundN(startPt[0]), roundN(startPt[1])]];
  for (const s of segs) {
    if (s.synthetic) continue;
    if (s.type === 'L') {
      out.push([VERB.LINE, roundN(s.end[0]), roundN(s.end[1])]);
    } else if (s.type === 'Q') {
      out.push([
        VERB.QUAD,
        roundN(s.ctrl[0]),
        roundN(s.ctrl[1]),
        roundN(s.end[0]),
        roundN(s.end[1]),
      ]);
    } else {
      out.push([
        VERB.CUBIC,
        roundN(s.c1[0]),
        roundN(s.c1[1]),
        roundN(s.c2[0]),
        roundN(s.c2[1]),
        roundN(s.end[0]),
        roundN(s.end[1]),
      ]);
    }
  }
  out.push([VERB.CLOSE]);
  return out;
}

export function reverseClosedContourKeepStart(
  contourCmds: readonly Cmd[],
  explicitCloseWanted: boolean,
  VERB: VerbMap
): Cmd[] {
  const { start, segs } = contourToSegments(contourCmds, VERB);

  const reversed: Segment[] = segs
    .slice()
    .reverse()
    .map((s) => {
      if (s.type === 'L') {
        return { type: 'L', start: s.end, end: s.start, synthetic: false };
      }
      if (s.type === 'Q') {
        return {
          type: 'Q',
          start: s.end,
          ctrl: s.ctrl,
          end: s.start,
          synthetic: false,
        };
      }
      return {
        type: 'C',
        start: s.end,
        c1: s.c2,
        c2: s.c1,
        end: s.start,
        synthetic: false,
      };
    });

  applyClosePolicy(reversed, start, explicitCloseWanted);
  return segmentsToContourCmds(start, reversed, VERB);
}

export function rotateClosedContourToStart(
  contourCmds: readonly Cmd[],
  desiredStart: Point,
  explicitCloseWanted: boolean,
  VERB: VerbMap
): Cmd[] {
  const { segs } = contourToSegments(contourCmds, VERB);

  let idx = -1;
  for (let i = 0; i < segs.length; i++) {
    if (eqPt(segs[i]!.start, desiredStart)) {
      idx = i;
      break;
    }
  }
  if (idx === -1) {
    for (let i = 0; i < segs.length; i++) {
      if (eqPt(segs[i]!.end, desiredStart)) {
        idx = (i + 1) % segs.length;
        break;
      }
    }
  }
  if (idx === -1) return [...contourCmds];

  const rotated = segs.slice(idx).concat(segs.slice(0, idx));
  applyClosePolicy(rotated, desiredStart, explicitCloseWanted);
  return segmentsToContourCmds(desiredStart, rotated, VERB);
}

export function mergeMoves(
  aMoves: readonly Point[] | undefined,
  bMoves: readonly Point[] | undefined
): Point[] {
  const out: Point[] = [];
  const pushUnique = (pt: Point) => {
    for (const existing of out) {
      if (eqPt(existing, pt)) return;
    }
    out.push(pt);
  };
  for (const m of aMoves || []) pushUnique(normPt(m));
  for (const m of bMoves || []) pushUnique(normPt(m));
  return out;
}

export function bestStartMinYMinX(
  contourCmds: readonly Cmd[],
  VERB: VerbMap
): Point | null {
  let best: Point | null = null;
  for (const cmd of contourCmds) {
    const v = cmd[0]!;
    const add = (x: number, y: number) => {
      const p: Point = [x, y];
      if (!best) {
        best = p;
        return;
      }
      if (p[1] < best[1] - 1e-9) best = p;
      else if (Math.abs(p[1] - best[1]) < 1e-9 && p[0] < best[0] - 1e-9)
        best = p;
    };

    if (v === VERB.MOVE) add(cmd[1]!, cmd[2]!);
    else if (v === VERB.LINE) add(cmd[1]!, cmd[2]!);
    else if (v === VERB.QUAD) add(cmd[3]!, cmd[4]!);
    else if (v === VERB.CUBIC) add(cmd[5]!, cmd[6]!);
  }
  return best;
}
/**
 * Convert contour commands to a polyline by sampling curves.
 * Used for ray-casting containment tests.
 */
export function contourToPolyline(
  contourCmds: readonly Cmd[],
  V: VerbMap,
  steps = 8
): Point[] {
  let cx = 0,
    cy = 0;
  let sx = 0,
    sy = 0;
  const pts: Point[] = [];

  for (const cmd of contourCmds) {
    const v = cmd[0]!;
    if (v === V.MOVE) {
      cx = cmd[1]!;
      cy = cmd[2]!;
      sx = cx;
      sy = cy;
      pts.push([cx, cy]);
    } else if (v === V.LINE) {
      cx = cmd[1]!;
      cy = cmd[2]!;
      pts.push([cx, cy]);
    } else if (v === V.QUAD) {
      const x0 = cx,
        y0 = cy;
      const x1 = cmd[1]!,
        y1 = cmd[2]!;
      const x2 = cmd[3]!,
        y2 = cmd[4]!;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        pts.push([
          mt * mt * x0 + 2 * mt * t * x1 + t * t * x2,
          mt * mt * y0 + 2 * mt * t * y1 + t * t * y2,
        ]);
      }
      cx = x2;
      cy = y2;
    } else if (v === V.CUBIC) {
      const x0 = cx,
        y0 = cy;
      const x1 = cmd[1]!,
        y1 = cmd[2]!;
      const x2 = cmd[3]!,
        y2 = cmd[4]!;
      const x3 = cmd[5]!,
        y3 = cmd[6]!;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        pts.push([
          mt * mt * mt * x0 +
            3 * mt * mt * t * x1 +
            3 * mt * t * t * x2 +
            t * t * t * x3,
          mt * mt * mt * y0 +
            3 * mt * mt * t * y1 +
            3 * mt * t * t * y2 +
            t * t * t * y3,
        ]);
      }
      cx = x3;
      cy = y3;
    } else if (v === V.CLOSE) {
      if (cx !== sx || cy !== sy) pts.push([sx, sy]);
      cx = sx;
      cy = sy;
    }
  }
  return pts;
}

/**
 * Ray-casting point-in-polygon test.
 */
export function pointInPolygon(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Get a representative point on the contour boundary (midpoint of first segment).
 */
export function getContourSamplePoint(
  contourCmds: readonly Cmd[],
  V: VerbMap
): Point | null {
  let cx = 0,
    cy = 0;
  for (const cmd of contourCmds) {
    const v = cmd[0]!;
    if (v === V.MOVE) {
      cx = cmd[1]!;
      cy = cmd[2]!;
    } else if (v === V.LINE) {
      return [(cx + cmd[1]!) / 2, (cy + cmd[2]!) / 2];
    } else if (v === V.QUAD) {
      const t = 0.5,
        mt = 0.5;
      return [
        mt * mt * cx + 2 * mt * t * cmd[1]! + t * t * cmd[3]!,
        mt * mt * cy + 2 * mt * t * cmd[2]! + t * t * cmd[4]!,
      ];
    } else if (v === V.CUBIC) {
      const t = 0.5,
        mt = 0.5;
      return [
        mt ** 3 * cx +
          3 * mt ** 2 * t * cmd[1]! +
          3 * mt * t ** 2 * cmd[3]! +
          t ** 3 * cmd[5]!,
        mt ** 3 * cy +
          3 * mt ** 2 * t * cmd[2]! +
          3 * mt * t ** 2 * cmd[4]! +
          t ** 3 * cmd[6]!,
      ];
    }
  }
  return null;
}

/**
 * Apply containment-based winding fix to contour objects.
 * Even nesting depth = CCW (outer), odd = CW (hole).
 */
export function applyContainmentWinding(
  contourObjs: Array<{
    cmds: Cmd[];
    explicitCloseWanted: boolean;
    absA: number;
  }>,
  V: VerbMap
): void {
  const n = contourObjs.length;
  if (n === 0) return;

  const polylines = contourObjs.map((obj) => contourToPolyline(obj.cmds, V));
  const samplePts = contourObjs.map((obj) =>
    getContourSamplePoint(obj.cmds, V)
  );
  const depths = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i++) {
    const pt = samplePts[i];
    if (!pt) continue;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (pointInPolygon(pt[0], pt[1], polylines[j]!)) {
        depths[i] = (depths[i] ?? 0) + 1;
      }
    }
  }

  const ensureOrient = (
    obj: { cmds: Cmd[]; explicitCloseWanted: boolean },
    wantCCW: boolean
  ) => {
    const a = approxSignedAreaFromContourCmds(obj.cmds, V);
    const isCCW = a > 0;
    if (wantCCW !== isCCW) {
      obj.cmds = reverseClosedContourKeepStart(
        obj.cmds,
        obj.explicitCloseWanted,
        V
      );
    }
  };

  for (let i = 0; i < n; i++) {
    ensureOrient(contourObjs[i]!, depths[i]! % 2 === 0);
  }
}

export type Contour = {
  cmds: Cmd[];
  explicitCloseWanted: boolean;
  absA: number;
};

export function orientedContours(cmds: readonly Cmd[], V: VerbMap): Contour[] {
  const contours = splitContours(cmds, V).map((c) => {
    const explicitCloseWanted = explicitCloseWantedFromCmds(c, V);
    const cc = ensureClosed(c, V);
    const a = approxSignedAreaFromContourCmds(cc, V);
    return { cmds: cc, absA: Math.abs(a), explicitCloseWanted };
  });
  contours.sort((x, y) => y.absA - x.absA);
  applyContainmentWinding(contours, V);
  return contours;
}

export function canonicalContourCmds(
  cmds: readonly Cmd[],
  recordedMoves: readonly Point[],
  preferMinYMinXStart: boolean,
  V: VerbMap
): Cmd[] {
  const moves = recordedMoves.map((m) => normPt([m[0], m[1]]));
  const used = new Array(moves.length).fill(false);
  const contours = orientedContours(cmds, V);

  for (const obj of contours) {
    let cc = obj.cmds;

    for (let i = 0; i < moves.length; i++) {
      if (used[i]) continue;
      const target = moves[i]!;
      const { segs } = contourToSegments(cc, V);
      const found = segs.some(
        (s) => eqPt(s.start, target) || eqPt(s.end, target)
      );
      if (found) {
        used[i] = true;
        cc = rotateClosedContourToStart(cc, target, obj.explicitCloseWanted, V);
        break;
      }
    }

    if (preferMinYMinXStart) {
      const best = bestStartMinYMinX(cc, V);
      if (best) {
        cc = rotateClosedContourToStart(cc, best, obj.explicitCloseWanted, V);
      }
    }

    obj.cmds = cc;
  }

  return contours.flatMap((x) => x.cmds);
}

export function contoursArea(cmds: readonly Cmd[], V: VerbMap): number {
  let total = 0;
  for (const c of splitContours(cmds, V)) {
    total += Math.abs(approxSignedAreaFromContourCmds(ensureClosed(c, V), V));
  }
  return total;
}
