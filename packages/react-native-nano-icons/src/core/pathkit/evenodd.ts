import type { Cmd, PathKitModule } from './types';
import {
  cmdsToPathData,
  fillTypes,
  orientedContours,
  verbMap,
} from './contours';

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
  const V = verbMap(PathKit);

  // 1. Parse and simplify with EVENODD fill type
  const p = PathKit.FromSVGString(d);
  if (!p) return d;

  p.setFillType(fillTypes(PathKit).EVENODD);
  p.simplify();

  // Get the simplified SVG string and re-parse for command access
  const simplified = p.toSVGString();
  p.delete?.();

  const p2 = PathKit.FromSVGString(simplified);
  if (!p2) return simplified;

  const cmds: Cmd[] = p2.toCmds();
  p2.delete?.();

  if (cmds.length === 0) return simplified;

  // 2.+3. Split into contours and fix winding via containment analysis
  const allCmds = orientedContours(cmds, V).flatMap((x) => x.cmds);

  // 4. Reconstruct d string from fixed commands
  return cmdsToPathData(allCmds, V);
}
