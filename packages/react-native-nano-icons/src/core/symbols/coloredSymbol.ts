import { parseColor } from '../../utils/parse.js';

// Colored symbol emitter: original fills + z-order, shipped as an `.imageset`.
export type ColoredSymbolLayer = {
  d: string;
  fill: string | null;
};

// Rendered height (points). Width follows aspect ratio, capped at MAX_WIDTH.
const ICON_HEIGHT = 24;
const MAX_WIDTH = ICON_HEIGHT * 3;

function num(n: number): string {
  return Number(n.toFixed(3)).toString();
}

// Fill → SVG `fill` (+ `fill-opacity`).
function fillAttrs(fill: string | null): string {
  // Null fill = black default.
  if (fill === null) return 'fill="rgb(0,0,0)"';
  const [r, g, b, a] = parseColor(fill);
  const rgb = `fill="rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})"`;
  return a < 1 ? `${rgb} fill-opacity="${Number(a.toFixed(4))}"` : rgb;
}

// Build the colored SVG from z-ordered layers. viewBox = content box (or source
// viewBox); canvas keeps the aspect ratio.
export function buildColoredSymbolSvg(opts: {
  layers: ColoredSymbolLayer[];
  viewBox: [number, number, number, number];
  /** Content box `[x, y, w, h]`; preferred over the viewBox when given. */
  contentBounds?: [number, number, number, number];
}): string {
  const { layers, viewBox, contentBounds } = opts;
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
    .map((layer) => `  <path ${fillAttrs(layer.fill)} d="${layer.d}"/>`)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(cw)}" height="${num(ch)}" viewBox="${num(bx)} ${num(by)} ${num(bw)} ${num(bh)}">
${paths}
</svg>
`;
}
