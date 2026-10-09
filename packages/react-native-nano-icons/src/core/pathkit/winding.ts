import type { Cmd, PathKitModule, PathKitPath, VerbMap } from './types';
import {
  cmdsToPathData,
  orientedContours,
  reverseClosedContourKeepStart,
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
