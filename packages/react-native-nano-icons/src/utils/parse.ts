import { CSS_NAMED_COLORS } from '../const/colors';

// e.g. u0041.svg -> 65
export function parseCodepointFromFilename(filename: string): number {
  const m = /^u([0-9a-fA-F]+)\.svg$/.exec(filename);
  if (!m) throw new Error(`Unexpected glyph filename: ${filename}`);
  return parseInt(m[1]!, 16);
}

// e.g. #ff0000 -> [255, 0, 0, 1], rgba(255, 0, 0, 0.5) -> [255, 0, 0, 0.5], rgb(255, 0, 0) -> [255, 0, 0, 1], blue -> [0, 0, 255, 1] etc.
export function parseColor(
  color: string
): [r: number, g: number, b: number, a: number] {
  const c = color.trim();

  // rgba(r,g,b,a)
  if (c.indexOf('rgba(') === 0) {
    const inner = c.slice(5, c.indexOf(')'));
    const p = inner.split(',');
    return [+(p[0] ?? '0'), +(p[1] ?? '0'), +(p[2] ?? '0'), +(p[3] ?? '1')];
  }

  // rgb(r,g,b)
  if (c.indexOf('rgb(') === 0) {
    const inner = c.slice(4, c.indexOf(')'));
    const p = inner.split(',');
    return [+(p[0] ?? '0'), +(p[1] ?? '0'), +(p[2] ?? '0'), 1];
  }

  // hex — first char is '#' (charCode 35)
  if (c.charCodeAt(0) === 35) {
    if (c.length === 9) {
      // #rrggbbaa
      return [
        parseInt(c.slice(1, 3), 16),
        parseInt(c.slice(3, 5), 16),
        parseInt(c.slice(5, 7), 16),
        parseInt(c.slice(7, 9), 16) / 255,
      ];
    }
    if (c.length === 7) {
      // #rrggbb
      return [
        parseInt(c.slice(1, 3), 16),
        parseInt(c.slice(3, 5), 16),
        parseInt(c.slice(5, 7), 16),
        1,
      ];
    }
    if (c.length === 4) {
      // #rgb — expand each nibble × 17
      return [
        parseInt(c.slice(1, 2), 16) * 17,
        parseInt(c.slice(2, 3), 16) * 17,
        parseInt(c.slice(3, 4), 16) * 17,
        1,
      ];
    }
  }

  // named color lookup (O(1))
  const named = CSS_NAMED_COLORS[c.toLowerCase()];
  if (named !== undefined) return [named[0], named[1], named[2], 1];

  // unknown — SVG default is opaque black
  return [0, 0, 0, 1];
}
