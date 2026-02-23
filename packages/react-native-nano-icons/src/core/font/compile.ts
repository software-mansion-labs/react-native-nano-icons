import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';

import { forceTtfMetrics } from './metrics.js';
import svg2ttf from 'svg2ttf';
import { SVGIcons2SVGFontStream } from 'svgicons2svgfont';
import { parseCodepointFromFilename } from '../../utils/parse.js';

async function writeGlyphStreamToFont(
  fontStream: SVGIcons2SVGFontStream,
  svgPath: string,
  filename: string
): Promise<void> {
  const codepoint = parseCodepointFromFilename(filename);
  const name = path.basename(filename, '.svg');

  return new Promise((resolve, reject) => {
    const glyphStream = fs.createReadStream(svgPath);

    (glyphStream as any).metadata = {
      name,
      unicode: [String.fromCodePoint(codepoint)],
    };

    glyphStream.on('error', reject);
    // Do not add fontStream.on("error", reject) here — one per glyph would exceed
    // Node's default MaxListeners (10). Font stream errors are handled once below.
    fontStream.write(glyphStream);
    glyphStream.on('end', resolve);
  });
}

export async function compileTtfFromGlyphSVGs(opts: {
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
      (a, b) => parseCodepointFromFilename(a) - parseCodepointFromFilename(b)
    );

  if (files.length === 0)
    throw new Error(`No glyph SVGs found in: ${glyphDir}`);

  const fontStream = new SVGIcons2SVGFontStream({
    fontName,
    fontHeight: upm,
    normalize: false,
    ascent,
    descent,
  });

  const svgFontChunks: Buffer[] = [];
  fontStream.on('data', (c: Buffer | string) =>
    svgFontChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  );

  // Single error listener for the font stream; per-glyph errors are handled in writeGlyphStreamToFont.
  let fontStreamReject: (err: Error) => void;
  const fontStreamErrorPromise = new Promise<never>((_, rej) => {
    fontStreamReject = rej;
  });
  fontStream.on('error', (err: Error) => fontStreamReject(err));

  for (const f of files) {
    await Promise.race([
      writeGlyphStreamToFont(fontStream, path.join(glyphDir, f), f),
      fontStreamErrorPromise,
    ]);
  }

  fontStream.end();
  await once(fontStream, 'end');

  const svgFontString = Buffer.concat(svgFontChunks).toString('utf8');
  const ttfRaw = svg2ttf(svgFontString);
  const rawBuf = Buffer.from(ttfRaw.buffer);

  const fixedBuf = forceTtfMetrics(rawBuf, upm, ascent, descent, lineGap);

  fs.mkdirSync(path.dirname(outTtfPath), { recursive: true });
  fs.writeFileSync(outTtfPath, fixedBuf);
}
