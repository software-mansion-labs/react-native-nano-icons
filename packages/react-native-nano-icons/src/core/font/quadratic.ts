const cubic2quad = require('cubic2quad') as (
  p1x: number,
  p1y: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  p2x: number,
  p2y: number,
  errorBound: number
) => number[];

const COMMAND = /([MLQCZ])([^MLQCZ]*)/g;
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

export const QUADRATIC_ERROR_BOUND_EM = 1 / 512;

export function toQuadraticPath(d: string, errorBound: number): string {
  const out: string[] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, rawArgs] of d.matchAll(COMMAND)) {
    const args = (rawArgs!.match(NUMBER) ?? []).map(Number);
    if (cmd === 'C') {
      for (let i = 0; i + 5 < args.length; i += 6) {
        const quads = cubic2quad(
          x,
          y,
          args[i]!,
          args[i + 1]!,
          args[i + 2]!,
          args[i + 3]!,
          args[i + 4]!,
          args[i + 5]!,
          errorBound
        );
        for (let j = 2; j + 3 < quads.length; j += 4) {
          out.push(
            `Q${quads[j]} ${quads[j + 1]} ${quads[j + 2]} ${quads[j + 3]}`
          );
        }
        x = args[i + 4]!;
        y = args[i + 5]!;
      }
      continue;
    }
    out.push(`${cmd}${rawArgs!.trim()}`);
    if (cmd !== 'Z' && args.length >= 2) {
      x = args[args.length - 2]!;
      y = args[args.length - 1]!;
    }
  }
  return out.join('');
}
