import type { ColorValue } from 'react-native';

/** Shallow-compare two color props (single value or array) instead of arr ref for memo equality. */
export function shallowEqualColor(
  a: ColorValue | ColorValue[] | undefined,
  b: ColorValue | ColorValue[] | undefined
): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  return false;
}
