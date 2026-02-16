// src/core/font/metrics.ts
export function forceTtfMetrics(
  Font: any,
  ttfBuffer: Buffer,
  upm: number,
  ascent: number,
  descent: number,
  lineGap: number,
): Buffer {
  const font = Font.create(ttfBuffer, {
    type: "ttf",
    hinting: false,
    compound2simple: false,
    inflate: null,
    combinePath: false,
  });

  const data = font.get();

  data.head = data.head || {};
  data.head.unitsPerEm = upm;

  data.hhea = data.hhea || {};
  data.hhea.ascent = ascent;
  data.hhea.descent = -Math.abs(descent);
  data.hhea.lineGap = lineGap;

  data["OS/2"] = data["OS/2"] || {};
  data["OS/2"].usWinAscent = ascent;
  data["OS/2"].usWinDescent = Math.abs(descent);
  data["OS/2"].sTypoAscender = ascent;
  data["OS/2"].sTypoDescender = -Math.abs(descent);
  data["OS/2"].sTypoLineGap = lineGap;

  data["OS/2"].fsSelection = (data["OS/2"].fsSelection || 0) | (1 << 7);

  font.set(data);

  const out = font.write({ type: "ttf", hinting: false });
  return Buffer.from(out);
}
