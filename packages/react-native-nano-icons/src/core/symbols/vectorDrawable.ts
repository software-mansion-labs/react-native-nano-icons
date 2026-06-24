import { parseColor } from '../../utils/parse.js';
import type { SymbolTemplateLayer } from './template.js';
import type { ColoredSymbolLayer } from './coloredSymbol.js';

/**
 * Android VectorDrawable emitter — the tab-bar counterpart to iOS
 * `.symbolset`/`.imageset`. `android:pathData` takes SVG path syntax verbatim
 * (nonzero winding by default), so prepared layers drop straight in.
 * Monochrome = solid-black fills, tinted by the bar (like symbolset `template`);
 * multicolor = keep each layer's fill.
 *
 * VectorDrawable's viewport always starts at (0,0), so a non-zero content origin
 * is absorbed by a translating `<group>`.
 */

// Intrinsic size (dp): height fixed to tab-icon size, width follows aspect
// ratio (capped). Mirrors coloredSymbol.ts.
const ICON_HEIGHT = 24;
const MAX_WIDTH = ICON_HEIGHT * 3;

function num(n: number): string {
  return Number(n.toFixed(3)).toString();
}

/** [r,g,b] (0–255) → `#rrggbb`. */
function hexColor(r: number, g: number, b: number): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Fill attrs from a source fill (null = default black). */
function fillAttrs(fill: string | null): string {
  if (fill === null) return 'android:fillColor="#000000"';
  const [r, g, b, a] = parseColor(fill);
  const color = `android:fillColor="${hexColor(r, g, b)}"`;
  return a < 1 ? `${color} android:fillAlpha="${Number(a.toFixed(4))}"` : color;
}

/**
 * VectorDrawable XML from z-ordered layers. `contentBounds` (tight `[x,y,w,h]`,
 * defaults to viewBox) sets the viewport so padding doesn't shrink the icon.
 */
export function buildVectorDrawableXml(opts: {
  /** Monochrome layers (solid black) or colored layers (original fills). */
  layers: SymbolTemplateLayer[] | ColoredSymbolLayer[];
  multicolor: boolean;
  viewBox: [number, number, number, number];
  /** Tight content box `[x, y, w, h]`; used instead of the viewBox when given. */
  contentBounds?: [number, number, number, number];
}): string {
  const { layers, multicolor, viewBox, contentBounds } = opts;
  const [bx, by, bw0, bh0] = contentBounds ?? viewBox;
  const bw = bw0 === 0 ? 1 : bw0;
  const bh = bh0 === 0 ? 1 : bh0;

  // Size by height; width follows aspect ratio, capped at MAX_WIDTH.
  let ch = ICON_HEIGHT;
  let cw = ICON_HEIGHT * (bw / bh);
  if (cw > MAX_WIDTH) {
    cw = MAX_WIDTH;
    ch = MAX_WIDTH * (bh / bw);
  }

  const paths = layers
    .map((layer) => {
      const fill = multicolor
        ? fillAttrs((layer as ColoredSymbolLayer).fill)
        : 'android:fillColor="#000000"';
      return `    <path ${fill} android:pathData="${layer.d}"/>`;
    })
    .join('\n');

  // Translate group absorbs the viewport origin (VectorDrawable has none).
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${num(cw)}dp"
    android:height="${num(ch)}dp"
    android:viewportWidth="${num(bw)}"
    android:viewportHeight="${num(bh)}">
  <group android:translateX="${num(-bx)}" android:translateY="${num(-by)}">
${paths}
  </group>
</vector>
`;
}
