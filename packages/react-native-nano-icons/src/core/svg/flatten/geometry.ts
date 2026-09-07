// Ported from picosvg geometric_types.py (Apache-2.0, Copyright 2020 Google LLC)

export const DEFAULT_ALMOST_EQUAL_TOLERANCE = 1e-9;

export type Pt = { x: number; y: number };

export function pt(x = 0, y = 0): Pt {
  return { x, y };
}

export function almostEqual(
  c1: number,
  c2: number,
  tolerance = DEFAULT_ALMOST_EQUAL_TOLERANCE
): boolean {
  return Math.abs(c1 - c2) <= tolerance;
}

export function ptEquals(a: Pt, b: Pt): boolean {
  return a.x === b.x && a.y === b.y;
}

export function ptAlmostEquals(
  a: Pt,
  b: Pt,
  tolerance = DEFAULT_ALMOST_EQUAL_TOLERANCE
): boolean {
  return almostEqual(a.x, b.x, tolerance) && almostEqual(a.y, b.y, tolerance);
}

export function ptSub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function ptAdd(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function ptMul(a: Pt, scalar: number): Pt {
  return { x: a.x * scalar, y: a.y * scalar };
}

// Exact port of Python's round(x, ndigits): round-half-to-even computed on
// the exact binary value of the double, not on a decimal approximation.
// (Naive `Math.round(x * 10**n) / 10**n` mis-rounds e.g. 0.155 at 2 digits.)
export function pythonRound(x: number, ndigits: number): number {
  if (!Number.isFinite(x) || Number.isInteger(x)) {
    return x;
  }

  // decompose the double into mantissa * 2^exp exactly
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const bits = buf.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const expBits = Number((bits >> 52n) & 0x7ffn);
  const fracBits = bits & 0xfffffffffffffn;
  let mantissa: bigint;
  let exp: number;
  if (expBits === 0) {
    mantissa = fracBits;
    exp = -1074;
  } else {
    mantissa = fracBits | (1n << 52n);
    exp = expBits - 1075;
  }

  const pow10 = 10n ** BigInt(Math.abs(ndigits));
  // want k = halfEven(x * 10^ndigits) as an exact integer
  let num = mantissa * (ndigits >= 0 ? pow10 : 1n);
  let den = ndigits >= 0 ? 1n : pow10;
  if (exp >= 0) {
    num <<= BigInt(exp);
  } else {
    den <<= BigInt(-exp);
  }

  let k = num / den;
  const rem = num % den;
  const twice = rem * 2n;
  if (twice > den || (twice === den && k % 2n === 1n)) {
    k += 1n;
  }

  const scaled =
    ndigits >= 0 ? Number(k) / Number(pow10) : Number(k) * Number(pow10);
  return negative ? -scaled : scaled;
}

export function ntos(n: number): string {
  // strip superfluous .0 decimals; Python str(int(n)) for integral floats
  return Object.is(n, -0) ? '0' : String(n);
}

export type Rect = { x: number; y: number; w: number; h: number };

export function rect(x = 0, y = 0, w = 0, h = 0): Rect {
  return { x, y, w, h };
}

export function rectEmpty(r: Rect): boolean {
  return r.w === 0 || r.h === 0;
}
