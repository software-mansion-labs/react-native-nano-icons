/** @jest-environment node */

import { computePlacement } from '../src/core/svg/layers';

const UPM = 1000;
const SAFE_ZONE = 800;

function placement(viewBox: [number, number, number, number]) {
  return computePlacement({ upm: UPM, safeZone: SAFE_ZONE, viewBox });
}

describe('computePlacement() unit tests', () => {
  test('scale fits height for a square viewBox', () => {
    const { scale } = placement([0, 0, 24, 24]);
    expect(scale).toBeCloseTo(SAFE_ZONE / 24);
  });

  test('wide viewBox produces a larger advance width than square', () => {
    const wide = placement([0, 0, 48, 24]);
    const square = placement([0, 0, 24, 24]);
    expect(wide.adv).toBeGreaterThan(square.adv);
  });

  test('tall viewBox produces a smaller advance width than square', () => {
    const tall = placement([0, 0, 24, 48]);
    const square = placement([0, 0, 24, 24]);
    expect(tall.adv).toBeLessThan(square.adv);
  });

  test('zero-height viewBox does not throw (uses safeVh = 1)', () => {
    expect(() => placement([0, 0, 24, 0])).not.toThrow();
  });

  test('zero-width viewBox produces advance >= 1 (minimum advance guard)', () => {
    const { adv } = placement([0, 0, 0, 24]);
    expect(adv).toBeGreaterThanOrEqual(1);
  });

  test('viewBox offset is preserved in returned vx and vy', () => {
    const { vx, vy } = placement([10, 20, 24, 24]);
    expect(vx).toBe(10);
    expect(vy).toBe(20);
  });
});
