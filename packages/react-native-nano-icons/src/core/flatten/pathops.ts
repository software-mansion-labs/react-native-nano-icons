import type { Cmd, PathKitModule, PathKitPath, Point } from '../pathkit/types';
import {
  canonicalContourCmds,
  contoursArea,
  fillTypes,
  mergeMoves,
  normPt,
  verbMap,
} from '../pathkit/contours';
import type { SvgCommand } from './path';
import type { Affine2D } from './transform';

export class PathOpsError extends Error {}

type TrackedPath = { p: PathKitPath; moves: Point[] };

export function createPathOps(PathKit: PathKitModule) {
  const V = verbMap(PathKit);
  const FILL = fillTypes(PathKit);
  const Caps = PathKit.StrokeCap ?? {};
  const Joins = PathKit.StrokeJoin ?? {};
  const Ops = PathKit.PathOp ?? {};

  const LINE_CAP: Record<string, number> = {
    butt: Caps.BUTT ?? 0,
    round: Caps.ROUND ?? 1,
    square: Caps.SQUARE ?? 2,
  };
  const LINE_JOIN: Record<string, number> = {
    miter: Joins.MITER ?? 0,
    round: Joins.ROUND ?? 1,
    bevel: Joins.BEVEL ?? 2,
  };
  const OP_UNION = Ops.UNION ?? 0;
  const OP_INTERSECT = Ops.INTERSECT ?? 1;

  function fillTypeFor(fillRule: string): number {
    if (fillRule === 'nonzero') return FILL.WINDING;
    if (fillRule === 'evenodd') return FILL.EVENODD;
    throw new Error(`Invalid fill rule: ${fillRule}`);
  }

  function dispose(h: TrackedPath): void {
    h.p.delete?.();
  }

  function fromCommands(
    cmds: Iterable<SvgCommand>,
    fillRule: string
  ): TrackedPath {
    const p = PathKit.NewPath();
    p.setFillType(fillTypeFor(fillRule));
    const moves: Point[] = [];
    for (const [cmd, args] of cmds) {
      switch (cmd) {
        case 'M':
          p.moveTo(args[0]!, args[1]!);
          moves.push(normPt([args[0]!, args[1]!]));
          break;
        case 'L':
          p.lineTo(args[0]!, args[1]!);
          break;
        case 'Q':
          p.quadTo(args[0]!, args[1]!, args[2]!, args[3]!);
          break;
        case 'C':
          p.cubicTo(args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!);
          break;
        case 'Z':
          p.close();
          break;
        default:
          p.delete?.();
          throw new Error(`No mapping to Skia for "${cmd} ${args}"`);
      }
    }
    return { p, moves };
  }

  function normalizedCmds(h: TrackedPath): Cmd[] {
    const p2 = PathKit.FromSVGString(h.p.toSVGString());
    const cmds = p2 ? p2.toCmds() : [];
    p2?.delete?.();
    return cmds;
  }

  function simplifyToWinding(h: TrackedPath): void {
    try {
      h.p.simplify();
      const p2 = PathKit.FromSVGString(h.p.toSVGString());
      if (p2) {
        h.p.delete?.();
        h.p = p2;
      }
    } catch {}
    h.p.setFillType(FILL.WINDING);
  }

  function toCommands(h: TrackedPath): SvgCommand[] {
    const cmds = canonicalContourCmds(
      normalizedCmds(h),
      h.moves,
      h.moves.length === 0,
      V
    );
    const out: SvgCommand[] = [];
    for (const cmd of cmds) {
      const v = cmd[0]!;
      if (v === V.MOVE) out.push(['M', [cmd[1]!, cmd[2]!]]);
      else if (v === V.LINE) out.push(['L', [cmd[1]!, cmd[2]!]]);
      else if (v === V.QUAD)
        out.push(['Q', [cmd[1]!, cmd[2]!, cmd[3]!, cmd[4]!]]);
      else if (v === V.CUBIC)
        out.push(['C', [cmd[1]!, cmd[2]!, cmd[3]!, cmd[4]!, cmd[5]!, cmd[6]!]]);
      else if (v === V.CLOSE) out.push(['Z', []]);
      else throw new Error(`Unexpected verb in cmds: ${v}`);
    }
    return out;
  }

  function combine(
    a: TrackedPath,
    b: TrackedPath,
    op: number
  ): TrackedPath | null {
    try {
      const out = PathKit.MakeFromOp(a.p, b.p, op);
      if (!out) return null;
      return { p: out, moves: mergeMoves(a.moves, b.moves) };
    } catch {
      return null;
    }
  }

  function doPathop(
    op: number,
    cmdSeqs: readonly SvgCommand[][],
    fillRules: readonly string[]
  ): SvgCommand[] {
    if (!cmdSeqs.length) {
      return [];
    }
    let skPath = fromCommands(cmdSeqs[0]!, fillRules[0]!);
    try {
      for (let i = 1; i < cmdSeqs.length; i++) {
        const skPath2 = fromCommands(cmdSeqs[i]!, fillRules[i]!);
        const merged = combine(skPath, skPath2, op);
        dispose(skPath2);
        if (merged === null) {
          throw new PathOpsError('operation did not succeed');
        }
        // the result keeps its own fill rule until simplify resolves it below:
        // relabelling it nonzero here would leave hole contours wound as if
        // they still subtract, and simplify would then discard them
        dispose(skPath);
        skPath = merged;
      }
      simplifyToWinding(skPath);
      return toCommands(skPath);
    } finally {
      dispose(skPath);
    }
  }

  return {
    union(
      cmdSeqs: readonly SvgCommand[][],
      fillRules: readonly string[]
    ): SvgCommand[] {
      return doPathop(OP_UNION, cmdSeqs, fillRules);
    },

    intersection(
      cmdSeqs: readonly SvgCommand[][],
      fillRules: readonly string[]
    ): SvgCommand[] {
      return doPathop(OP_INTERSECT, cmdSeqs, fillRules);
    },

    // simplified path filled using the "nonzero" winding rule
    removeOverlaps(cmds: Iterable<SvgCommand>, fillRule: string): SvgCommand[] {
      const h = fromCommands(cmds, fillRule);
      try {
        simplifyToWinding(h);
        return toCommands(h);
      } finally {
        dispose(h);
      }
    },

    transformCmds(cmds: Iterable<SvgCommand>, affine: Affine2D): SvgCommand[] {
      const h = fromCommands(cmds, 'nonzero');
      const { a, b, c, d, e, f } = affine;
      const p = PathKit.NewPath(h.p);
      p.transform(a, c, e, b, d, f, 0, 0, 1);
      const transformed: TrackedPath = {
        p,
        moves: h.moves.map(([x, y]) =>
          normPt([a * x + c * y + e, b * x + d * y + f])
        ),
      };
      try {
        return toCommands(transformed);
      } finally {
        dispose(h);
        dispose(transformed);
      }
    },

    // a path that is a shape with its stroke applied; fill with nonzero
    strokeCmds(
      cmds: Iterable<SvgCommand>,
      svgLinecap: string,
      svgLinejoin: string,
      strokeWidth: number,
      strokeMiterlimit: number,
      _tolerance: number,
      dashArray: readonly number[] = [],
      dashOffset = 0.0
    ): SvgCommand[] {
      const cap = LINE_CAP[svgLinecap];
      if (cap === undefined) {
        throw new Error(`Unsupported cap ${svgLinecap}`);
      }
      const join = LINE_JOIN[svgLinejoin];
      if (join === undefined) {
        throw new Error(`Unsupported join ${svgLinejoin}`);
      }
      // the input path's fill_rule doesn't affect the stroked result
      const h = fromCommands(cmds, 'nonzero');
      const work = PathKit.NewPath(h.p);
      let strokedPath: PathKitPath;
      try {
        if (dashArray.length === 2 && typeof work.dash === 'function') {
          work.dash(
            Number(dashArray[0]),
            Number(dashArray[1]),
            dashOffset || 0
          );
        }
        let stroked = work.stroke({
          width: strokeWidth,
          cap,
          join,
          miter_limit: strokeMiterlimit,
        });
        if (!stroked || typeof stroked.toCmds !== 'function') stroked = work;
        if (stroked !== work) work.delete?.();
        strokedPath = stroked;
      } catch {
        strokedPath = work;
      }
      const result: TrackedPath = { p: strokedPath, moves: [] };
      try {
        simplifyToWinding(result);
        return toCommands(result);
      } finally {
        dispose(h);
        dispose(result);
      }
    },

    // the path's absolute area
    pathArea(cmds: Iterable<SvgCommand>, fillRule: string): number {
      const h = fromCommands(cmds, fillRule);
      try {
        simplifyToWinding(h);
        try {
          return contoursArea(normalizedCmds(h), V);
        } catch {
          return 0.0;
        }
      } finally {
        dispose(h);
      }
    },
  };
}

export type PathOps = ReturnType<typeof createPathOps>;
