import fsp from 'node:fs/promises';
import path from 'node:path';

function roundInt(n: number): number {
  return Math.round(n);
}

export function computePlacement(opts: {
  upm: number;
  safeZone: number;
  viewBox: [number, number, number, number];
}) {
  const [vx, vy, vw, vh] = opts.viewBox;

  // Guard against invalid viewBox height from source svg
  const safeVh = vh === 0 ? 1 : vh;

  // ✅ Fit-to-height (same visual height for all glyphs)
  const scale = opts.safeZone / safeVh;

  const totalPadding = (opts.upm - opts.safeZone) / 2;

  // Scaled dimensions in font units
  const scaledW = vw * scale;
  const scaledH = vh * scale; // ~= safeZone

  // ✅ proportional advance width (includes same padding concept as vertical)
  // This is the width of the glyph coordinate space we will emit in the layer SVG.
  const adv = Math.max(1, roundInt(scaledW + totalPadding * 2));

  // Center scaled content within (adv x upm)
  // (when adv == scaledW + 2*padding, xOff is basically padding, with rounding compensation)
  const xOff = (adv - scaledW) / 2;
  const yOff = (opts.upm - scaledH) / 2; // ~= totalPadding

  return { vx, vy, scale, xOff, yOff, adv };
}

export async function writeLayerSvg(opts: {
  tempDir: string;
  upm: number;
  adv: number;
  vx: number;
  vy: number;
  scale: number;
  xOff: number;
  yOff: number;
  d: string;
  codepoint: number;
}): Promise<void> {
  const hex = opts.codepoint.toString(16).padStart(4, '0');

  const layerSvg = `
    <svg viewBox="0 0 ${opts.adv} ${
    opts.upm
  }" xmlns="http://www.w3.org/2000/svg">
      <rect width="${opts.adv}" height="${opts.upm}" fill="none" />
      <g transform="translate(${opts.xOff}, ${opts.yOff}) scale(${
    opts.scale
  }) translate(${-opts.vx}, ${-opts.vy})">
        <path d="${opts.d}" fill="black" />
      </g>
    </svg>`.trim();

  await fsp.writeFile(path.join(opts.tempDir, `u${hex}.svg`), layerSvg, 'utf8');
}
