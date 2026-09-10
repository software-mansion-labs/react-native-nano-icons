// Ported from picosvg svg_pathops.py (Apache-2.0, Copyright 2020 Google LLC).
// Replaces the pyodide pathops.py shim: same buildPathopsBackend calls, same
// semantics (simplify(fix_winding) forces WINDING, convertConicsToQuads no-op).

import type { PathKitModule, WrappedPath } from '../../types.js';
import { buildPathopsBackend } from '../svg_pathops.js';
import type { SvgCommand } from './path.js';
import type { Affine2D } from './transform.js';

export class PathOpsError extends Error {}

const FILL_WINDING = 0;
const FILL_EVEN_ODD = 1;

const OP_UNION = 0;
const OP_INTERSECTION = 1;
const OP_DIFFERENCE = 2;

const SVG_TO_SKIA_LINE_CAP: Record<string, number> = {
  butt: 0,
  round: 1,
  square: 2,
};

const SVG_TO_SKIA_LINE_JOIN: Record<string, number> = {
  miter: 0,
  round: 1,
  bevel: 2,
  // No arcs or miter-clip
};

const SKIA_VERB_TO_SVG_CMD: Record<number, string> = {
  0: 'M',
  1: 'L',
  2: 'Q',
  3: 'C',
  4: 'Z',
  // CONIC(5) should not occur: convertConicsToQuads takes care of these
};

function fillTypeFor(fillRule: string): number {
  if (fillRule === 'nonzero') return FILL_WINDING;
  if (fillRule === 'evenodd') return FILL_EVEN_ODD;
  throw new Error(`Invalid fill rule: ${fillRule}`);
}

export function createPathOps(PathKit: PathKitModule) {
  const backend = buildPathopsBackend(PathKit);

  function skiaPath(cmds: Iterable<SvgCommand>, fillRule: string): WrappedPath {
    const h = backend.create_path(fillTypeFor(fillRule));
    for (const [cmd, args] of cmds) {
      switch (cmd) {
        case 'M':
          backend.move_to(h, args[0]!, args[1]!);
          break;
        case 'L':
          backend.line_to(h, args[0]!, args[1]!);
          break;
        case 'Q':
          backend.quad_to(h, args[0]!, args[1]!, args[2]!, args[3]!);
          break;
        case 'C':
          backend.cubic_to(
            h,
            args[0]!,
            args[1]!,
            args[2]!,
            args[3]!,
            args[4]!,
            args[5]!
          );
          break;
        case 'Z':
          backend.close(h);
          break;
        default:
          backend.delete_path(h);
          throw new Error(`No mapping to Skia for "${cmd} ${args}"`);
      }
    }
    return h;
  }

  function svgCommands(h: WrappedPath): SvgCommand[] {
    const out: SvgCommand[] = [];
    for (const [verb, points] of backend.iter_segments(h)) {
      const cmd = SKIA_VERB_TO_SVG_CMD[verb];
      if (cmd === undefined) {
        throw new Error(`No mapping to svg for "${verb} ${points}"`);
      }
      out.push([cmd, points.flatMap((p) => [p[0], p[1]])]);
    }
    return out;
  }

  // shim Path.simplify(): best-effort, forces WINDING when fixWinding
  function simplifyInPlace(h: WrappedPath, fixWinding: boolean): void {
    backend.simplify(h, fixWinding);
    if (fixWinding) {
      backend.set_fill_type(h, FILL_WINDING);
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
    let skPath = skiaPath(cmdSeqs[0]!, fillRules[0]!);
    try {
      for (let i = 1; i < cmdSeqs.length; i++) {
        const skPath2 = skiaPath(cmdSeqs[i]!, fillRules[i]!);
        const merged = backend.op(skPath, skPath2, op);
        backend.delete_path(skPath2);
        if (merged === null) {
          throw new PathOpsError('operation did not succeed');
        }
        // shim op(fix_winding=True)
        backend.set_fill_type(merged, FILL_WINDING);
        backend.delete_path(skPath);
        skPath = merged;
      }
      simplifyInPlace(skPath, true);
      return svgCommands(skPath);
    } finally {
      backend.delete_path(skPath);
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
      return doPathop(OP_INTERSECTION, cmdSeqs, fillRules);
    },

    difference(
      cmdSeqs: readonly SvgCommand[][],
      fillRules: readonly string[]
    ): SvgCommand[] {
      return doPathop(OP_DIFFERENCE, cmdSeqs, fillRules);
    },

    // simplified path filled using the "nonzero" winding rule
    removeOverlaps(cmds: Iterable<SvgCommand>, fillRule: string): SvgCommand[] {
      const h = skiaPath(cmds, fillRule);
      try {
        simplifyInPlace(h, true);
        return svgCommands(h);
      } finally {
        backend.delete_path(h);
      }
    },

    transformCmds(cmds: Iterable<SvgCommand>, affine: Affine2D): SvgCommand[] {
      const h = skiaPath(cmds, 'nonzero');
      const transformed = backend.transform(
        h,
        affine.a,
        affine.b,
        affine.c,
        affine.d,
        affine.e,
        affine.f
      );
      try {
        return svgCommands(transformed);
      } finally {
        backend.delete_path(h);
        backend.delete_path(transformed);
      }
    },

    // a path that is a shape with its stroke applied; fill with nonzero
    strokeCmds(
      cmds: Iterable<SvgCommand>,
      svgLinecap: string,
      svgLinejoin: string,
      strokeWidth: number,
      strokeMiterlimit: number,
      tolerance: number,
      dashArray: readonly number[] = [],
      dashOffset = 0.0
    ): SvgCommand[] {
      const cap = SVG_TO_SKIA_LINE_CAP[svgLinecap];
      if (cap === undefined) {
        throw new Error(`Unsupported cap ${svgLinecap}`);
      }
      const join = SVG_TO_SKIA_LINE_JOIN[svgLinejoin];
      if (join === undefined) {
        throw new Error(`Unsupported join ${svgLinejoin}`);
      }
      // the input path's fill_rule doesn't affect the stroked result
      const h = skiaPath(cmds, 'nonzero');
      const stroked = backend.stroke(
        h,
        strokeWidth,
        cap,
        join,
        strokeMiterlimit,
        [...dashArray],
        dashOffset
      );
      try {
        backend.convert_conics_to_quads(stroked, tolerance);
        // via the shim, simplify never raises - best-effort like the pyodide path
        simplifyInPlace(stroked, true);
        return svgCommands(stroked);
      } finally {
        backend.delete_path(h);
        backend.delete_path(stroked);
      }
    },

    boundingBox(cmds: Iterable<SvgCommand>): [number, number, number, number] {
      const h = skiaPath(cmds, 'nonzero');
      try {
        return backend.bounds(h);
      } finally {
        backend.delete_path(h);
      }
    },

    // the path's absolute area
    pathArea(cmds: Iterable<SvgCommand>, fillRule: string): number {
      const h = skiaPath(cmds, fillRule);
      try {
        simplifyInPlace(h, true);
        return backend.area(h);
      } finally {
        backend.delete_path(h);
      }
    },
  };
}

export type PathOps = ReturnType<typeof createPathOps>;
