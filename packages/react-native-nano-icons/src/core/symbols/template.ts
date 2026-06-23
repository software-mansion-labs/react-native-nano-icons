import type { NanoLogger } from '../types.js';

/**
 * Custom SF Symbol template (v3.0) emitter. Geometry (validated against Xcode 26
 * actool): 800×600 canvas, cap band Capline y=76 → Baseline y=146, source
 * columns at x=265/465/665.
 *
 * A variable template must contain all three source groups (actool rejects
 * single-variant templates) -> duplicating the same paths into each — identical
 * topology satisfies the point-correspondence requirement.
 */

const CAPLINE_Y = 76;
const BASELINE_Y = 146;
const CAP_BAND = BASELINE_Y - CAPLINE_Y; // 70
const CAP_CENTER = (CAPLINE_Y + BASELINE_Y) / 2; // 111

// Content box is scaled to this height (= cap band) and centered, so symbols
// fill their optical box instead of rendering small inside a padded viewBox.
const GLYPH_HEIGHT = CAP_BAND;

const VARIANT_CENTERS: ReadonlyArray<readonly [name: string, cx: number]> = [
  ['Ultralight', 265],
  ['Regular', 465],
  ['Black', 665],
];

/** Columns are 200 apart — clamp glyph width so variants never overlap. */
const MAX_GLYPH_WIDTH = 160;

const H_REFERENCE_PATH =
  'M85,145.755 L87.685,145.755 L113.369,79.287 L114.052002,79.287 ' +
  'L114.052002,76 L112.148,76 L85,145.755 Z ' +
  'M95.693,121.536 L130.996,121.536 L130.263,119.313 L96.474,119.313 L95.693,121.536 Z ' +
  'M139.14999,145.755 L141.787,145.755 L114.638,76 L113.466,76 L113.466,79.287 L139.14999,145.755 Z';

function fmt(n: number): string {
  return Number(n.toFixed(3)).toString();
}

export type SymbolTemplateLayer = {
  /** Path data in source viewBox coordinates (nonzero winding). */
  d: string;
};

// Front-most layer = primary, next = secondary, rest = tertiary.
export function hierarchicalTier(
  layerIndex: number,
  layerCount: number
): 'primary' | 'secondary' | 'tertiary' {
  const fromFront = layerCount - 1 - layerIndex;
  if (fromFront === 0) return 'primary';
  if (fromFront === 1) return 'secondary';
  return 'tertiary';
}

/**
 * Build the template SVG for one symbol. Layers are back→front; multi-layer
 * symbols get `monochrome-N` + `hierarchical-N:<tier>` class annotations,
 * single-layer ones are emitted plain.
 */
export function buildSymbolTemplate(opts: {
  layers: SymbolTemplateLayer[];
  viewBox: [number, number, number, number];
  /** Tight content box `[x, y, w, h]`; used instead of the viewBox when given. */
  contentBounds?: [number, number, number, number];
  /** Shown in the template's Notes group. */
  descriptiveName?: string;
  logger?: NanoLogger;
}): string {
  const { layers, viewBox, contentBounds, descriptiveName, logger } = opts;
  // Fit the content box, not the padded viewBox; fall back to viewBox.
  const [bx, by, bw, bh] = contentBounds ?? viewBox;

  const safeBw = bw === 0 ? 1 : bw;
  const safeBh = bh === 0 ? 1 : bh;

  // Fit to cap-band height, clamped so wide glyphs don't overlap the next column.
  let scale = GLYPH_HEIGHT / safeBh;
  if (safeBw * scale > MAX_GLYPH_WIDTH) {
    scale = MAX_GLYPH_WIDTH / safeBw;
    logger?.info(
      `    ↔ Wide glyph clamped to ${MAX_GLYPH_WIDTH} template units (aspect ${fmt(safeBw / safeBh)}:1)`
    );
  }

  const scaledW = safeBw * scale;
  const scaledH = safeBh * scale;
  // Center on the cap-band midline.
  const yOff = CAP_CENTER - scaledH / 2;

  const annotate = layers.length > 1;

  const pathsMarkup = (indent: string): string =>
    layers
      .map((layer, i) => {
        if (!annotate) return `${indent}<path d="${layer.d}"/>`;
        const cls = `monochrome-${i} hierarchical-${i}:${hierarchicalTier(i, layers.length)}`;
        return `${indent}<path class="${cls}" d="${layer.d}"/>`;
      })
      .join('\n');

  const groups: string[] = [];
  const margins: string[] = [];

  for (const [name, cx] of VARIANT_CENTERS) {
    const tx = cx - scaledW / 2;
    // Translate into the column + scale into the cap band (handles non-zero origin).
    const e = tx - bx * scale;
    const f = yOff - by * scale;
    groups.push(
      `    <g id="${name}-S" transform="matrix(${fmt(scale)},0,0,${fmt(scale)},${fmt(e)},${fmt(f)})">\n` +
        pathsMarkup('      ') +
        `\n    </g>`
    );
    margins.push(
      `    <path id="left-margin-${name}-S" d="M${fmt(tx)},56 l0,110" />\n` +
        `    <path id="right-margin-${name}-S" d="M${fmt(tx + scaledW)},56 l0,110" />`
    );
  }

  const nameNote = descriptiveName
    ? `\n      <text id="descriptive-name" fill="#505050" x="785.0" y="560.0" text-anchor="end">Generated from ${descriptiveName}</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="800" height="600" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <g id="Notes" font-family="'LucidaGrande', 'Lucida Grande', sans-serif" font-weight="500" font-size="13px">
    <rect x="0" y="0" width="800" height="600" fill="white"/>
    <g font-weight="500" font-size="13px">
      <text x="18px" y="176px">Small</text>
      <text x="18px" y="376px">Medium</text>
      <text x="18px" y="576px">Large</text>
    </g>
    <g font-weight="300" font-size="9px">
      <text x="250px" y="30px">Ultralight</text>
      <text x="450px" y="30px">Regular</text>
      <text x="650px" y="30px">Black</text>${nameNote}
      <text id="template-version" fill="#505050" x="785.0" y="575.0" text-anchor="end">Template v.3.0</text>
      <text fill="#505050" x="785.0" y="590.0" text-anchor="end">Generated by react-native-nano-icons</text>
    </g>
  </g>
  <g id="Guides" stroke="rgb(39,170,225)" stroke-width="0.5px">
    <path id="Capline-S" d="M18,${CAPLINE_Y} l800,0" />
    <path id="H-reference" d="${H_REFERENCE_PATH}" stroke="none" />
    <path id="Baseline-S" d="M18,${BASELINE_Y} l800,0" />
${margins.join('\n')}
    <path id="Capline-M" d="M18,276 l800,0" />
    <path id="Baseline-M" d="M18,346 l800,0" />
    <path id="Capline-L" d="M18,476 l800,0" />
    <path id="Baseline-L" d="M18,546 l800,0" />
  </g>
  <g id="Symbols">
${groups.join('\n')}
  </g>
</svg>
`;
}
