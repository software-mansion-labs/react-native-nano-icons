/** @jest-environment node */

import { toQuadraticPath } from '../src/core/font/quadratic';

describe('toQuadraticPath', () => {
  test('cubic segments become quadratics that end at the same point', () => {
    const out = toQuadraticPath('M0 0C10 20 30 20 40 0Z', 1);
    expect(out).not.toMatch(/C/);
    expect(out.startsWith('M0 0Q')).toBe(true);
    expect(out.endsWith(' 40 0Z')).toBe(true);
  });

  test('a looser error bound produces fewer quadratics', () => {
    const tight = toQuadraticPath('M0 0C0 100 200 100 200 0', 0.05);
    const loose = toQuadraticPath('M0 0C0 100 200 100 200 0', 5);
    const count = (d: string) => (d.match(/Q/g) ?? []).length;
    expect(count(loose)).toBeLessThan(count(tight));
  });

  test('moves, lines, quadratics and closes pass through unchanged', () => {
    const d = 'M1 2L3 4Q5 6 7 8L-1.5 2e1Z';
    expect(toQuadraticPath(d, 1)).toBe(d);
  });

  test('consecutive cubics chain from the previous end point', () => {
    const out = toQuadraticPath('M0 0C0 10 10 10 10 0C10 -10 20 -10 20 0', 1);
    expect(out).not.toMatch(/C/);
    expect(out.endsWith(' 20 0')).toBe(true);
  });
});
