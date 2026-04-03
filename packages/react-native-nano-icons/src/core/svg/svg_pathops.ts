import type {
  Cmd,
  PathKitModule,
  VerbMap,
  WrappedPath,
  Point,
} from '../types.js';

//** */

// ----- numeric helpers -----
const EPS = 1e-2;

// ✅ round-half-to-even (banker's rounding) at ndigits
function roundN(x: number, ndigits = 3): number {
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

function normPt(p: Point): [number, number] {
  return [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000];
}

function eqPt(a: Point, b: Point): boolean {
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

function approxSignedAreaFromContourCmds(
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

function splitContours(cmds: readonly Cmd[], VERB: VerbMap): Cmd[][] {
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

function ensureClosed(contourCmds: readonly Cmd[], VERB: VerbMap): Cmd[] {
  return contourCmds.some((c) => c[0] === VERB.CLOSE)
    ? [...contourCmds]
    : [...contourCmds, [VERB.CLOSE]];
}

function explicitCloseWantedFromCmds(
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

function contourToSegments(
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

function reverseClosedContourKeepStart(
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

function rotateClosedContourToStart(
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

function cmdsToVerbPoints(
  cmds: readonly Cmd[],
  VERB: VerbMap
): Array<[number, Point[]]> {
  const out: Array<[number, Point[]]> = [];
  for (const cmd of cmds) {
    const v = cmd[0]!;
    if (v === VERB.MOVE) out.push([0, [[cmd[1]!, cmd[2]!]]]);
    else if (v === VERB.LINE) out.push([1, [[cmd[1]!, cmd[2]!]]]);
    else if (v === VERB.QUAD)
      out.push([
        2,
        [
          [cmd[1]!, cmd[2]!],
          [cmd[3]!, cmd[4]!],
        ],
      ]);
    else if (v === VERB.CUBIC)
      out.push([
        3,
        [
          [cmd[1]!, cmd[2]!],
          [cmd[3]!, cmd[4]!],
          [cmd[5]!, cmd[6]!],
        ],
      ]);
    else if (v === VERB.CLOSE) out.push([4, []]);
    else throw new Error(`Unexpected verb in cmds: ${v}`);
  }
  return out;
}

function wrapPath(pathkitPath: WrappedPath['p']): WrappedPath {
  return { p: pathkitPath, meta: { moves: [] } };
}

function cloneWrap(h: WrappedPath, PathKit: PathKitModule): WrappedPath {
  const p2 = PathKit.NewPath(h.p);
  const out = wrapPath(p2);
  out.meta.moves = h.meta?.moves ? h.meta.moves.map((m) => [m[0], m[1]]) : [];
  return out;
}

function mergeMoves(
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

function bestStartMinYMinX(
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


// ---------------------------------------------------------------------------
// Containment helpers (module-level for reuse by fixPathWinding)
// ---------------------------------------------------------------------------

function buildVerbMap(PathKit: PathKitModule): VerbMap {
  return {
    MOVE: PathKit.MOVE_VERB ?? 0,
    LINE: PathKit.LINE_VERB ?? 1,
    QUAD: PathKit.QUAD_VERB ?? 2,
    CONIC: PathKit.CONIC_VERB ?? 3,
    CUBIC: PathKit.CUBIC_VERB ?? 4,
    CLOSE: PathKit.CLOSE_VERB ?? 5,
  };
}

/**
 * Convert contour commands to a polyline by sampling curves.
 * Used for ray-casting containment tests.
 */
function contourToPolyline(
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
        pts.push([mt * mt * x0 + 2 * mt * t * x1 + t * t * x2, mt * mt * y0 + 2 * mt * t * y1 + t * t * y2]);
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
          mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
          mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
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
function pointInPolygon(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Get a representative point on the contour boundary (midpoint of first segment).
 */
function getContourSamplePoint(contourCmds: readonly Cmd[], V: VerbMap): Point | null {
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
        mt ** 3 * cx + 3 * mt ** 2 * t * cmd[1]! + 3 * mt * t ** 2 * cmd[3]! + t ** 3 * cmd[5]!,
        mt ** 3 * cy + 3 * mt ** 2 * t * cmd[2]! + 3 * mt * t ** 2 * cmd[4]! + t ** 3 * cmd[6]!,
      ];
    }
  }
  return null;
}

/**
 * Apply containment-based winding fix to contour objects.
 * Even nesting depth = CCW (outer), odd = CW (hole).
 */
function applyContainmentWinding(
  contourObjs: Array<{ cmds: Cmd[]; explicitCloseWanted: boolean; absA: number }>,
  V: VerbMap
): void {
  const n = contourObjs.length;
  if (n === 0) return;

  const polylines = contourObjs.map((obj) => contourToPolyline(obj.cmds, V));
  const samplePts = contourObjs.map((obj) => getContourSamplePoint(obj.cmds, V));
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
      obj.cmds = reverseClosedContourKeepStart(obj.cmds, obj.explicitCloseWanted, V);
    }
  };

  for (let i = 0; i < n; i++) {
    ensureOrient(contourObjs[i]!, depths[i]! % 2 === 0);
  }
}

/**
 * Convert a path `d` string with evenodd fill semantics to an equivalent
 * path that renders identically under nonzero winding.
 *
 * Steps:
 * 1. Parse via PathKit, set fill type to EVENODD, simplify (resolve topology)
 * 2. Split into contours, compute containment depths
 * 3. Fix winding: even depth = CCW (outer), odd depth = CW (hole)
 * 4. Reconstruct d string
 */
export function convertEvenoddToWinding(
  PathKit: PathKitModule,
  d: string
): string {
  const V = buildVerbMap(PathKit);

  // 1. Parse and simplify with EVENODD fill type
  const p = PathKit.FromSVGString(d);
  if (!p) return d;

  const FILL_EVENODD =
    PathKit?.FillType?.EVENODD ?? PathKit?.FillType?.EVEN_ODD ?? 1;
  p.setFillType(FILL_EVENODD);
  p.simplify();

  // Get the simplified SVG string and re-parse for command access
  const simplified = p.toSVGString();
  p.delete?.();

  const p2 = PathKit.FromSVGString(simplified);
  if (!p2) return simplified;

  const cmds: Cmd[] = p2.toCmds();
  p2.delete?.();

  if (cmds.length === 0) return simplified;

  // 2. Split into contours
  const contourObjs = splitContours(cmds, V).map((c) => {
    const explicitCloseWanted = explicitCloseWantedFromCmds(c, V);
    const cc = ensureClosed(c, V);
    const a = approxSignedAreaFromContourCmds(cc, V);
    return { cmds: cc, absA: Math.abs(a), explicitCloseWanted };
  });

  contourObjs.sort((x, y) => y.absA - x.absA);

  // 3. Fix winding via containment analysis
  applyContainmentWinding(contourObjs, V);

  // 4. Reconstruct d string from fixed commands
  const allCmds = contourObjs.flatMap((x) => x.cmds);
  const parts: string[] = [];
  for (const cmd of allCmds) {
    const v = cmd[0]!;
    if (v === V.MOVE) parts.push(`M${roundN(cmd[1]!)} ${roundN(cmd[2]!)}`);
    else if (v === V.LINE) parts.push(`L${roundN(cmd[1]!)} ${roundN(cmd[2]!)}`);
    else if (v === V.QUAD)
      parts.push(`Q${roundN(cmd[1]!)} ${roundN(cmd[2]!)} ${roundN(cmd[3]!)} ${roundN(cmd[4]!)}`);
    else if (v === V.CUBIC)
      parts.push(
        `C${roundN(cmd[1]!)} ${roundN(cmd[2]!)} ${roundN(cmd[3]!)} ${roundN(cmd[4]!)} ${roundN(cmd[5]!)} ${roundN(cmd[6]!)}`
      );
    else if (v === V.CLOSE) parts.push('Z');
  }

  return parts.join(' ');
}

// proxy to for picosvg to interatc with pathkit
export function buildPathopsBackend(PathKit: PathKitModule) {
  const VERB: VerbMap = buildVerbMap(PathKit);

  const FILL_EVENODD =
    PathKit?.FillType?.EVENODD ?? PathKit?.FillType?.EVEN_ODD ?? 1;
  const FILL_WINDING =
    PathKit?.FillType?.WINDING ?? PathKit?.FillType?.NONZERO ?? 0;

  function cmdsViaSvgRoundtrip(h: WrappedPath): Cmd[] {
    const svg = h.p.toSVGString();
    const p2 = PathKit.FromSVGString(svg);
    const cmds = p2 ? p2.toCmds() : [];
    if (p2) p2.delete?.();
    return cmds;
  }

  function normalizeSortRotateContours(
    cmds: Cmd[],
    h: WrappedPath,
    preferStrokeCanonical = false
  ): Cmd[] {
    const moves = (h.meta?.moves || []).map((m) => normPt([m[0], m[1]]));
    const used = new Array(moves.length).fill(false);

    // Build contour objects, but DO NOT normalize orientation yet.
    const contourObjs = splitContours(cmds, VERB).map((c) => {
      const explicitCloseWanted = explicitCloseWantedFromCmds(c, VERB);
      const cc = ensureClosed(c, VERB);
      const a = approxSignedAreaFromContourCmds(cc, VERB); // signed
      return { cmds: cc, absA: Math.abs(a), explicitCloseWanted };
    });

    // Big-to-small ordering gives deterministic outer→inner ordering.
    contourObjs.sort((x, y) => y.absA - x.absA);

    // Containment-based winding: compute nesting depth per contour via
    // ray-casting point-in-polygon. Even depth = outer (CCW), odd = hole (CW).
    applyContainmentWinding(contourObjs, VERB);

    // Rotate starts deterministically:
    // 1) If we have recorded MOVE points, try to rotate contour to a move point that lies on it.
    // 2) Otherwise, rotate to minY/minX point (helps stroke-ish paths)
    for (const obj of contourObjs) {
      let cc = obj.cmds;

      for (let i = 0; i < moves.length; i++) {
        if (used[i]) continue;
        const target = moves[i]!;
        const { segs } = contourToSegments(cc, VERB);
        const found = segs.some(
          (s) => eqPt(s.start, target) || eqPt(s.end, target)
        );
        if (found) {
          used[i] = true;
          cc = rotateClosedContourToStart(
            cc,
            target,
            obj.explicitCloseWanted,
            VERB
          );
          break;
        }
      }

      // If no move point was used, apply the deterministic start heuristic
      if (preferStrokeCanonical) {
        const best = bestStartMinYMinX(cc, VERB);
        if (best) {
          cc = rotateClosedContourToStart(
            cc,
            best,
            obj.explicitCloseWanted,
            VERB
          );
        }
      }

      obj.cmds = cc;
    }

    return contourObjs.flatMap((x) => x.cmds);
  }

  return {
    create_path(fillTypeInt: number): WrappedPath {
      const p = PathKit.NewPath();
      p.setFillType(fillTypeInt === 1 ? FILL_EVENODD : FILL_WINDING);
      return wrapPath(p);
    },

    clone_path(h: WrappedPath): WrappedPath {
      return cloneWrap(h, PathKit);
    },

    delete_path(h: WrappedPath): void {
      h?.p?.delete?.();
    },

    get_fill_type(h: WrappedPath): number {
      const ft = h.p.getFillType?.();
      return ft === FILL_EVENODD ? 1 : 0;
    },

    set_fill_type(h: WrappedPath, fillTypeInt: number): true {
      h.p.setFillType(fillTypeInt === 1 ? FILL_EVENODD : FILL_WINDING);
      return true;
    },

    move_to(h: WrappedPath, x: number, y: number): void {
      h.p.moveTo(x, y);
      h.meta.moves.push(normPt([x, y]));
    },

    line_to(h: WrappedPath, x: number, y: number): void {
      h.p.lineTo(x, y);
    },

    quad_to(
      h: WrappedPath,
      x1: number,
      y1: number,
      x2: number,
      y2: number
    ): void {
      h.p.quadTo(x1, y1, x2, y2);
    },

    cubic_to(
      h: WrappedPath,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      x3: number,
      y3: number
    ): void {
      h.p.cubicTo(x1, y1, x2, y2, x3, y3);
    },

    close(h: WrappedPath): void {
      h.p.close();
    },

    simplify(h: WrappedPath, fixWinding = false): boolean {
      try {
        // 1) simplify in place
        h.p.simplify();

        // 2) normalize representation via SVG roundtrip
        const svg = h.p.toSVGString();
        const p2 = PathKit.FromSVGString(svg);
        if (p2) {
          // replace underlying path handle
          h.p.delete?.();
          h.p = p2;
        }

        if (fixWinding) h.p.setFillType(FILL_WINDING);
        return true;
      } catch {
        return false;
      }
    },

    stroke(
      h: WrappedPath,
      width: number,
      capInt: number,
      joinInt: number,
      miterLimit: number,
      dashArray: unknown,
      dashOffset: number
    ): WrappedPath {
      const Caps = PathKit.StrokeCap ?? {};
      const Joins = PathKit.StrokeJoin ?? {};

      const cap =
        capInt === 1
          ? Caps.ROUND ?? 1
          : capInt === 2
          ? Caps.SQUARE ?? 2
          : Caps.BUTT ?? 0;

      const join =
        joinInt === 1
          ? Joins.ROUND ?? 1
          : joinInt === 2
          ? Joins.BEVEL ?? 2
          : Joins.MITER ?? 0;

      const work = PathKit.NewPath(h.p);

      try {
        if (
          Array.isArray(dashArray) &&
          dashArray.length === 2 &&
          typeof work.dash === 'function'
        ) {
          work.dash(
            Number(dashArray[0]),
            Number(dashArray[1]),
            dashOffset || 0
          );
        }

        let stroked = work.stroke({
          width,
          cap,
          join,
          miter_limit: miterLimit,
        });
        if (!stroked || typeof stroked.toCmds !== 'function') stroked = work;

        if (stroked !== work) work.delete?.();

        const wrapped = wrapPath(stroked);
        wrapped.meta.moves = [];
        return wrapped;
      } catch {
        const wrapped = wrapPath(work);
        wrapped.meta.moves = [];
        return wrapped;
      }
    },

    convert_conics_to_quads(_h: WrappedPath, _tol: number): void {
      // intentionally no-op
    },

    transform(
      h: WrappedPath,
      a: number,
      b: number,
      c: number,
      d: number,
      e: number,
      f: number
    ): WrappedPath {
      const p = PathKit.NewPath(h.p);
      p.transform(a, c, e, b, d, f, 0, 0, 1);

      const wrapped = wrapPath(p);
      wrapped.meta.moves = (h.meta?.moves || []).map(([x, y]) =>
        normPt([a * x + c * y + e, b * x + d * y + f])
      );
      return wrapped;
    },

    op(
      aHandle: WrappedPath,
      bHandle: WrappedPath,
      opInt: number
    ): WrappedPath | null {
      try {
        const Ops = PathKit.PathOp ?? {};
        const op =
          opInt === 1
            ? Ops.INTERSECT ?? 1
            : opInt === 2
            ? Ops.DIFFERENCE ?? 2
            : Ops.UNION ?? 0;

        const out = PathKit.MakeFromOp(aHandle.p, bHandle.p, op);
        if (!out) return null;

        const wrapped = wrapPath(out);
        wrapped.meta.moves = mergeMoves(
          aHandle.meta?.moves,
          bHandle.meta?.moves
        );
        return wrapped;
      } catch {
        return null;
      }
    },

    bounds(h: WrappedPath): [number, number, number, number] {
      const r = h.p.getBounds();
      return [r.fLeft, r.fTop, r.fRight, r.fBottom];
    },

    area(h: WrappedPath): number {
      try {
        const cmds = cmdsViaSvgRoundtrip(h);
        const contours = splitContours(cmds, VERB);
        let total = 0;
        for (const c of contours) {
          const cc = ensureClosed(c, VERB);
          total += Math.abs(approxSignedAreaFromContourCmds(cc, VERB));
        }
        return total;
      } catch {
        return 0.0;
      }
    },

    iter_segments(h: WrappedPath): Array<[number, Point[]]> {
      const cmds = cmdsViaSvgRoundtrip(h);
      const preferStrokeCanonical = (h.meta?.moves?.length || 0) === 0;
      const normalized = normalizeSortRotateContours(
        cmds,
        h,
        preferStrokeCanonical
      );
      return cmdsToVerbPoints(normalized, VERB);
    },
  };
}
