import { parseColor } from '../../utils/parse';
import type { PathKitModule, PathKitPath } from '../pathkit/types';

/**
 * Resolve stacked layers into SF Symbol template layers. Monochrome draws the
 * union in one color, so:
 * 1. Erase: near-white-over-darker = knockout — subtract from below, drop it.
 *    Skipped for all-white icons or white floating on transparent.
 * 2. Occlusion: subtract layers above from each layer (for palette/hierarchical).
 * In: back→front layers with fills. Out: visible layers in z-order.
 */
export function resolveSymbolLayers(
  PathKit: PathKitModule,
  layers: Array<{ d: string; fill: string | null }>,
  options?: { onEraseLayer?: (index: number) => void }
): Array<{ d: string; fill: string | null }> {
  if (layers.length <= 1) return layers.map((l) => ({ d: l.d, fill: l.fill }));

  const isWhiteish = (fill: string | null): boolean => {
    if (fill === null) return false;
    const [r, g, b, a] = parseColor(fill);
    return a >= 0.9 && r >= 240 && g >= 240 && b >= 240;
  };

  const whiteFlags = layers.map((l) => isWhiteish(l.fill));
  // All-white icon: never erase.
  const hasInk = whiteFlags.some((w) => !w);

  const Ops = PathKit.PathOp ?? {};
  const DIFFERENCE = Ops.DIFFERENCE ?? 0;
  const UNION = Ops.UNION ?? 1;
  const INTERSECT = Ops.INTERSECT ?? 2;

  const isEmptyD = (d: string) => d.trim() === '';

  type Resolved = { index: number; d: string; fill: string | null };
  const emitted: Resolved[] = [];

  // Walk top → bottom, tracking the union of everything above.
  let above: PathKitPath | null = null;
  for (let i = layers.length - 1; i >= 0; i--) {
    const p = PathKit.FromSVGString(layers[i]!.d);
    if (!p) {
      emitted.push({ index: i, d: layers[i]!.d, fill: layers[i]!.fill });
      continue;
    }
    p.simplify();

    // visible region = path minus everything above
    let visibleD: string;
    if (above === null) {
      visibleD = p.toSVGString();
    } else {
      const visible = PathKit.MakeFromOp(p, above, DIFFERENCE);
      if (visible) {
        visible.simplify();
        visibleD = visible.toSVGString();
        visible.delete?.();
      } else {
        visibleD = p.toSVGString();
      }
    }

    let erase = false;
    if (hasInk && whiteFlags[i]) {
      // Erase only where white overlaps geometry below (knockout); white over
      // transparent stays drawn.
      const belowUnion = unionOf(
        PathKit,
        layers.slice(0, i).map((l) => l.d)
      );
      if (belowUnion) {
        const overlap = PathKit.MakeFromOp(p, belowUnion, INTERSECT);
        const overlapD = overlap?.toSVGString() ?? '';
        overlap?.delete?.();
        belowUnion.delete?.();
        erase = !isEmptyD(overlapD);
      }
    }

    if (erase) {
      options?.onEraseLayer?.(i);
    } else if (!isEmptyD(visibleD)) {
      emitted.push({ index: i, d: visibleD, fill: layers[i]!.fill });
    }

    // Both normal and erase layers cut everything below them.
    if (above === null) {
      above = p;
    } else {
      const newAbove = PathKit.MakeFromOp(above, p, UNION);
      p.delete?.();
      if (newAbove) {
        newAbove.simplify();
        above.delete?.();
        above = newAbove;
      }
    }
  }
  above?.delete?.();

  return emitted
    .sort((a, b) => a.index - b.index)
    .map((r) => ({ d: r.d, fill: r.fill }));
}

function unionOf(PathKit: PathKitModule, ds: string[]): PathKitPath | null {
  const UNION = PathKit.PathOp?.UNION ?? 1;
  let acc: PathKitPath | null = null;
  for (const d of ds) {
    const p = PathKit.FromSVGString(d);
    if (!p) continue;
    if (acc === null) {
      acc = p;
      continue;
    }
    const merged = PathKit.MakeFromOp(acc, p, UNION);
    p.delete?.();
    if (merged) {
      acc.delete?.();
      acc = merged;
    }
  }
  return acc;
}

/**
 * Tight bounding box [x, y, w, h] of path `d` strings in source coords, or null.
 * Used to fit icon content (not the padded viewBox) to the cap band.
 */
export function contentBounds(
  PathKit: PathKitModule,
  ds: string[]
): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of ds) {
    const p = PathKit.FromSVGString(d);
    if (!p) continue;
    const b = p.getBounds();
    p.delete?.();
    if (
      !Number.isFinite(b.fLeft) ||
      !Number.isFinite(b.fTop) ||
      !Number.isFinite(b.fRight) ||
      !Number.isFinite(b.fBottom)
    ) {
      continue;
    }
    if (b.fLeft < minX) minX = b.fLeft;
    if (b.fTop < minY) minY = b.fTop;
    if (b.fRight > maxX) maxX = b.fRight;
    if (b.fBottom > maxY) maxY = b.fBottom;
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
  return [minX, minY, maxX - minX, maxY - minY];
}
