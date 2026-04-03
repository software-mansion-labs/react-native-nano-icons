import fs from 'node:fs';
import path from 'node:path';

import { forceTtfMetrics } from './metrics.js';
import svg2ttf from 'svg2ttf';

export type FontGlyph = {
  codepoint: number;
  advanceWidth: number;
  /** Path data already in font coordinates (Y-up, placement applied). */
  d: string;
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Build an SVG font XML string from pre-transformed glyph data.
 */
function buildSvgFontXml(opts: {
  fontName: string;
  glyphs: FontGlyph[];
  upm: number;
  ascent: number;
  descent: number;
}): string {
  const { fontName, glyphs, upm, ascent, descent } = opts;

  const glyphLines = glyphs.map((g) => {
    const hex = g.codepoint.toString(16);
    const name = `u${hex.padStart(4, '0')}`;
    return `<glyph glyph-name="${name}" unicode="&#x${hex};" horiz-adv-x="${g.advanceWidth}" d="${escapeXml(g.d)}"/>`;
  });

  return `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg">
<defs>
<font id="${escapeXml(fontName)}" horiz-adv-x="${upm}">
<font-face font-family="${escapeXml(fontName)}" units-per-em="${upm}" ascent="${ascent}" descent="${-Math.abs(descent)}"/>
<missing-glyph horiz-adv-x="0"/>
${glyphLines.join('\n')}
</font>
</defs>
</svg>`;
}

export function parseCompileTtfFromGlyphsError(
  err: unknown,
  codepointToIcon: Map<number, string>
) {
  const msg = err instanceof Error ? err.message : String(err);
  const cpMatch = msg.match(/glyph\s+"u([0-9a-fA-F]+)"/);
  if (cpMatch) {
    const cp = parseInt(cpMatch[1]!, 16);
    const iconName = codepointToIcon.get(cp);
    const detail = iconName
      ? `icon "${iconName}" (codepoint u${cpMatch[1]})`
      : `codepoint u${cpMatch[1]}`;
    throw new Error(`Font compilation failed for ${detail}: ${msg}`);
  }
  throw err;
}

/**
 * Compile a TTF font from pre-transformed glyph data.
 * Builds SVG font XML directly (no intermediate files), then converts via svg2ttf.
 */
export async function compileTtfFromGlyphs(opts: {
  glyphs: FontGlyph[];
  outTtfPath: string;
  fontName: string;
  upm: number;
  ascent: number;
  descent: number;
  lineGap?: number;
}): Promise<void> {
  const { glyphs, outTtfPath, fontName, upm, ascent, descent } = opts;
  const lineGap = opts.lineGap ?? 0;

  if (glyphs.length === 0)
    throw new Error('No glyphs to compile');

  const svgFontString = buildSvgFontXml({
    fontName,
    glyphs,
    upm,
    ascent,
    descent,
  });

  const ttfRaw = svg2ttf(svgFontString);
  const rawBuf = Buffer.from(ttfRaw.buffer);

  const fixedBuf = forceTtfMetrics(rawBuf, upm, ascent, descent, lineGap);

  fs.mkdirSync(path.dirname(outTtfPath), { recursive: true });
  fs.writeFileSync(outTtfPath, fixedBuf);
}
