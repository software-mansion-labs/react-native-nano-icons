import fsp from "node:fs/promises";
import path from "node:path";

export type GlyphMap = Record<string, { hex: string; color: string }[]>;

function hex4(n: number): string {
  return n.toString(16).padStart(4, "0");
}

export function computePlacement(opts: {
  upm: number;
  safeZone: number;
  viewBox: [number, number, number, number];
}) {
  const [vx, vy, vw, vh] = opts.viewBox;

  const scale = opts.safeZone / Math.max(vw, vh);
  const totalPadding = (opts.upm - opts.safeZone) / 2;
  const xOff = totalPadding + (opts.safeZone - vw * scale) / 2;
  const yOff = totalPadding + (opts.safeZone - vh * scale) / 2;

  return { vx, vy, scale, xOff, yOff };
}

export async function writeLayerSvg(opts: {
  tempDir: string;
  upm: number;
  vx: number;
  vy: number;
  scale: number;
  xOff: number;
  yOff: number;
  d: string;
  codepoint: number;
}): Promise<{ hex: string }> {
  const hex = hex4(opts.codepoint);

  const layerSvg = `
<svg viewBox="0 0 ${opts.upm} ${opts.upm}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${opts.upm}" height="${opts.upm}" fill="none" />
  <g transform="translate(${opts.xOff}, ${opts.yOff}) scale(${opts.scale}) translate(${-opts.vx}, ${-opts.vy})">
    <path d="${opts.d}" fill="black" />
  </g>
</svg>`.trim();

  await fsp.writeFile(path.join(opts.tempDir, `u${hex}.svg`), layerSvg, "utf8");
  return { hex };
}
