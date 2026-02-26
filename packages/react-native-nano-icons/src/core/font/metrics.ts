import { Font } from 'fonteditor-core';

export function forceTtfMetrics(
  ttfBuffer: Buffer,
  upm: number,
  ascent: number,
  descent: number,
  lineGap: number
): Buffer {
  const font = Font.create(ttfBuffer, {
    type: 'ttf',
    hinting: false,
    compound2simple: false,
    combinePath: false,
  });

  const data = font.get();

  data.head.unitsPerEm = upm;

  data.hhea.ascent = ascent;
  data.hhea.descent = -Math.abs(descent);
  data.hhea.lineGap = lineGap;

  data['OS/2'].usWinAscent = ascent;
  data['OS/2'].usWinDescent = Math.abs(descent);
  data['OS/2'].sTypoAscender = ascent;
  data['OS/2'].sTypoDescender = -Math.abs(descent);
  data['OS/2'].sTypoLineGap = lineGap;

  // Set USE_TYPO_METRICS flag (bit 7) in fsSelection.
  // This tells renderers to use sTypoAscender/sTypoDescender/sTypoLineGap for
  // line height calculations instead of the Win metrics (usWinAscent/usWinDescent).
  // Without this flag, Windows and some Android renderers ignore the Typo values
  // set above and fall back to Win metrics, causing icons to appear clipped or
  // misaligned vertically. The bitwise OR preserves all other existing style flags
  // (italic, bold, etc.) while ensuring this bit is always on.
  data['OS/2'].fsSelection = (data['OS/2'].fsSelection || 0) | (1 << 7);

  font.set(data);

  const out = font.write({ type: 'ttf', hinting: false }) as ArrayBuffer;
  return Buffer.from(out);
}
