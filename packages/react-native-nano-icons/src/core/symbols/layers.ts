import { parseColor } from '../../utils/parse';
import type { PathKitModule, PathKitPath } from '../pathkit/types';
import {
  canonicalWinding,
  orientedPathData,
  reversedWinding,
} from '../pathkit/winding';

/**
 * Resolve stacked layers into SF Symbol template layers. Monochrome joins every
 * layer into one nonzero-filled path, multicolor paints each layer on its own:
 * 1. Knockouts: layers annotated with `data-nano-knockout`, or (when nothing is
 *    annotated) near-white layers over ink. Their part over ink is emitted with
 *    reversed winding, so it cancels the ink beneath it in monochrome while
 *    multicolor still paints it in its own fill. Their part over nothing is
 *    drawn in both modes.
 * 2. Occlusion: subtract layers above from each layer; ink is never cut by a
 *    knockout, so the winding under every knockout is exactly one.
 * In: back→front layers with fills. Out: visible layers in z-order plus the
 * monochrome silhouette.
 */
export type SymbolLayerInput = {
  d: string;
  fill: string | null;
  knockout?: boolean;
};

export type SymbolLayer = { d: string; fill: string | null };

export type ResolvedSymbolLayers = {
  layers: SymbolLayer[];
  monochrome: string;
};

export function isKnockoutFill(fill: string | null): boolean {
  if (fill === null) return false;
  const [r, g, b, a] = parseColor(fill);
  return a >= 0.9 && r >= 240 && g >= 240 && b >= 240;
}

function knockoutFlags(layers: SymbolLayerInput[]): boolean[] {
  if (layers.some((l) => l.knockout)) return layers.map((l) => !!l.knockout);
  const whiteFlags = layers.map((l) => isKnockoutFill(l.fill));
  return whiteFlags.some((w) => !w) ? whiteFlags : layers.map(() => false);
}

function pathOps(PathKit: PathKitModule) {
  const Ops = PathKit.PathOp ?? {};
  const run = (a: string, b: string, op: number): string => {
    if (a.trim() === '') return op === (Ops.UNION ?? 1) ? b : '';
    if (b.trim() === '') return op === (Ops.INTERSECT ?? 2) ? '' : a;
    const pa = PathKit.FromSVGString(a);
    const pb = PathKit.FromSVGString(b);
    const out = pa && pb ? PathKit.MakeFromOp(pa, pb, op) : null;
    pa?.delete?.();
    pb?.delete?.();
    if (!out) return a;
    const d = orientedPathData(PathKit, out);
    out.delete?.();
    return d;
  };
  return {
    difference: (a: string, b: string) => run(a, b, Ops.DIFFERENCE ?? 0),
    union: (a: string, b: string) => run(a, b, Ops.UNION ?? 1),
    intersect: (a: string, b: string) => run(a, b, Ops.INTERSECT ?? 2),
  };
}

function resolveWithKnockouts(
  PathKit: PathKitModule,
  layers: SymbolLayerInput[],
  flags: boolean[],
  onKnockoutLayer?: (index: number) => void
): ResolvedSymbolLayers {
  const ops = pathOps(PathKit);
  const visible: string[] = new Array(layers.length).fill('');

  let aboveAll = '';
  let aboveInk = '';
  for (let i = layers.length - 1; i >= 0; i--) {
    const d = layers[i]!.d;
    visible[i] = ops.difference(d, flags[i] ? aboveAll : aboveInk);
    aboveAll = ops.union(aboveAll, d);
    if (!flags[i]) aboveInk = ops.union(aboveInk, d);
  }

  const emitted: SymbolLayer[] = [];
  let monochrome = '';
  layers.forEach((layer, i) => {
    const region = visible[i]!;
    if (region.trim() === '') return;
    if (!flags[i]) {
      emitted.push({ d: canonicalWinding(PathKit, region), fill: layer.fill });
      monochrome = ops.union(monochrome, region);
      return;
    }
    const inside = ops.intersect(region, monochrome);
    const outside = ops.difference(region, monochrome);
    const parts = [
      inside.trim() === '' ? '' : reversedWinding(PathKit, inside),
      outside.trim() === '' ? '' : canonicalWinding(PathKit, outside),
    ].filter((part) => part !== '');
    if (inside.trim() !== '') onKnockoutLayer?.(i);
    emitted.push({ d: parts.join(' '), fill: layer.fill });
    monochrome = ops.union(ops.difference(monochrome, inside), outside);
  });

  return { layers: emitted, monochrome: canonicalWinding(PathKit, monochrome) };
}

function resolveOccluded(
  PathKit: PathKitModule,
  layers: SymbolLayerInput[]
): ResolvedSymbolLayers {
  const Ops = PathKit.PathOp ?? {};
  const DIFFERENCE = Ops.DIFFERENCE ?? 0;
  const UNION = Ops.UNION ?? 1;

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

    if (!isEmptyD(visibleD)) {
      emitted.push({ index: i, d: visibleD, fill: layers[i]!.fill });
    }

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
  const monochrome = above?.toSVGString() ?? '';
  above?.delete?.();

  return {
    layers: emitted
      .sort((a, b) => a.index - b.index)
      .map((r) => ({ d: r.d, fill: r.fill })),
    monochrome,
  };
}

export function resolveSymbolLayers(
  PathKit: PathKitModule,
  layers: SymbolLayerInput[],
  options?: { onKnockoutLayer?: (index: number) => void }
): ResolvedSymbolLayers {
  const flags = knockoutFlags(layers);
  if (flags.some(Boolean)) {
    return resolveWithKnockouts(
      PathKit,
      layers,
      flags,
      options?.onKnockoutLayer
    );
  }
  if (layers.length <= 1) {
    return {
      layers: layers.map((l) => ({ d: l.d, fill: l.fill })),
      monochrome: layers[0]?.d ?? '',
    };
  }
  return resolveOccluded(PathKit, layers);
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
