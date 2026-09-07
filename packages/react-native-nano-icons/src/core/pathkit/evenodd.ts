import type { Cmd, PathKitModule } from './types';
import { fillTypes, orientedContours, roundN, verbMap } from './contours';

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
  const parts: string[] = [];
  for (const cmd of allCmds) {
    const v = cmd[0]!;
    if (v === V.MOVE) parts.push(`M${roundN(cmd[1]!)} ${roundN(cmd[2]!)}`);
    else if (v === V.LINE) parts.push(`L${roundN(cmd[1]!)} ${roundN(cmd[2]!)}`);
    else if (v === V.QUAD)
      parts.push(
        `Q${roundN(cmd[1]!)} ${roundN(cmd[2]!)} ${roundN(cmd[3]!)} ${roundN(cmd[4]!)}`
      );
    else if (v === V.CUBIC)
      parts.push(
        `C${roundN(cmd[1]!)} ${roundN(cmd[2]!)} ${roundN(cmd[3]!)} ${roundN(cmd[4]!)} ${roundN(cmd[5]!)} ${roundN(cmd[6]!)}`
      );
    else if (v === V.CLOSE) parts.push('Z');
  }

  return parts.join(' ');
}
