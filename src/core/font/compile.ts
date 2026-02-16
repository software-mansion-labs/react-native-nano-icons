// src/core/font/compile.ts
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

import { Font, SVGIcons2SVGFontStream, svg2ttf } from "./interop.js";
import { forceTtfMetrics } from "./metrics.js";

function parseCodepointFromFilename(filename: string): number {
  const m = /^u([0-9a-fA-F]+)\.svg$/.exec(filename);
  if (!m) throw new Error(`Unexpected glyph filename: ${filename}`);
  return parseInt(m[1]!, 16);
}

async function writeGlyphStreamToFont(
  fontStream: any,
  svgPath: string,
  filename: string,
): Promise<void> {
  const codepoint = parseCodepointFromFilename(filename);
  const name = path.basename(filename, ".svg");

  return new Promise((resolve, reject) => {
    const glyphStream = fs.createReadStream(svgPath);

    (glyphStream as any).metadata = {
      name,
      unicode: [String.fromCodePoint(codepoint)],
    };

    glyphStream.on("error", reject);
    // Do not add fontStream.on("error", reject) here — one per glyph would exceed
    // Node's default MaxListeners (10). Font stream errors are handled once below.
    fontStream.write(glyphStream);
    glyphStream.on("end", resolve);
  });
}

export async function compileTtfFromGlyphSvgs(opts: {
  glyphDir: string;
  outTtfPath: string;
  fontName: string;
  upm: number;
  ascent: number;
  descent: number;
  lineGap?: number;
}): Promise<void> {
  const { glyphDir, outTtfPath, fontName, upm, ascent, descent } = opts;
  const lineGap = opts.lineGap ?? 0;

  const files = fs
    .readdirSync(glyphDir)
    .filter((f) => /^u[0-9a-fA-F]+\.svg$/.test(f))
    .sort(
      (a, b) => parseCodepointFromFilename(a) - parseCodepointFromFilename(b),
    );

  if (files.length === 0)
    throw new Error(`No glyph svgs found in: ${glyphDir}`);

  const fontStream = new SVGIcons2SVGFontStream({
    fontName,
    fontHeight: upm,
    normalize: false,
    ascent,
    descent,
    log: () => {},
  });

  const svgFontChunks: Buffer[] = [];
  fontStream.on("data", (c: Buffer | string) =>
    svgFontChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
  );

  // Single error listener for the font stream; per-glyph errors are handled in writeGlyphStreamToFont.
  let fontStreamReject: (err: Error) => void;
  const fontStreamErrorPromise = new Promise<never>((_, rej) => {
    fontStreamReject = rej;
  });
  fontStream.on("error", (err: Error) => fontStreamReject!(err));

  for (const f of files) {
    await Promise.race([
      writeGlyphStreamToFont(fontStream, path.join(glyphDir, f), f),
      fontStreamErrorPromise,
    ]);
  }

  fontStream.end();
  await once(fontStream, "end");

  const svgFontString = Buffer.concat(svgFontChunks).toString("utf8");
  const ttfRaw = svg2ttf(svgFontString);
  const rawBuf = Buffer.from(ttfRaw.buffer);

  const fixedBuf = forceTtfMetrics(Font, rawBuf, upm, ascent, descent, lineGap);

  fs.mkdirSync(path.dirname(outTtfPath), { recursive: true });
  fs.writeFileSync(outTtfPath, fixedBuf);
}
