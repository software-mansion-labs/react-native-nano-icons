import type { IconProps } from '../types';
import { shallowEqualColor } from './shallowEqualColor';

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

export function shallowEqualStyle(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => shallowEqualStyle(item, b[i]))
    );
  }
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }
  const aStyle = a as Record<string, unknown>;
  const bStyle = b as Record<string, unknown>;
  const keys = Object.keys(aStyle);
  return (
    keys.length === Object.keys(bStyle).length &&
    keys.every(
      (key) => hasOwn(bStyle, key) && Object.is(aStyle[key], bStyle[key])
    )
  );
}

export function areIconPropsEqual<Name>(
  prev: IconProps<Name>,
  next: IconProps<Name>
): boolean {
  const keys = Object.keys(prev) as (keyof IconProps<Name>)[];
  if (keys.length !== Object.keys(next).length) return false;
  return keys.every((key) => {
    if (!hasOwn(next, key)) return false;
    if (key === 'style') return shallowEqualStyle(prev.style, next.style);
    if (key === 'color') return shallowEqualColor(prev.color, next.color);
    return Object.is(prev[key], next[key]);
  });
}
