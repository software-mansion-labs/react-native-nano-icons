import type { CSSProperties } from 'react';

type StyleRecord = Record<string, unknown>;

const SIDE_AXIS = {
  Top: 'Vertical',
  Bottom: 'Vertical',
  Left: 'Horizontal',
  Right: 'Horizontal',
} as const;

const SIDES = Object.keys(SIDE_AXIS) as (keyof typeof SIDE_AXIS)[];

const LOGICAL_RENAMES: Record<string, string> = {
  marginStart: 'marginInlineStart',
  marginEnd: 'marginInlineEnd',
  paddingStart: 'paddingInlineStart',
  paddingEnd: 'paddingInlineEnd',
  start: 'insetInlineStart',
  end: 'insetInlineEnd',
};

function flattenInto(style: unknown, out: StyleRecord): void {
  if (Array.isArray(style)) {
    for (const entry of style) flattenInto(entry, out);
  } else if (style != null && typeof style === 'object') {
    Object.assign(out, style);
  }
}

function expandBox(style: StyleRecord, prop: 'margin' | 'padding'): void {
  const horizontal = `${prop}Horizontal`;
  const vertical = `${prop}Vertical`;
  const hasAxis =
    style[horizontal] !== undefined || style[vertical] !== undefined;
  const hasSide = SIDES.some((side) => style[`${prop}${side}`] !== undefined);
  if (!hasAxis && !(hasSide && style[prop] !== undefined)) return;

  for (const side of SIDES) {
    const value =
      style[`${prop}${side}`] ??
      style[`${prop}${SIDE_AXIS[side]}`] ??
      style[prop];
    if (value !== undefined) style[`${prop}${side}`] = value;
  }
  delete style[prop];
  delete style[horizontal];
  delete style[vertical];
}

function transformFunction(entry: unknown): string {
  const [type, value] = Object.entries(entry as StyleRecord)[0] ?? [];
  if (type === undefined) return '';
  if (Array.isArray(value)) {
    const name = type === 'matrix' && value.length === 16 ? 'matrix3d' : type;
    return `${name}(${value.join(',')})`;
  }
  if (typeof value === 'number' && !type.startsWith('scale')) {
    return `${type}(${value}px)`;
  }
  return `${type}(${String(value)})`;
}

function lengthList(value: unknown[]): string {
  return value
    .map((v) => (typeof v === 'number' ? `${v}px` : String(v)))
    .join(' ');
}

export function resolveWebStyle(style: unknown): CSSProperties | undefined {
  if (style == null || style === false) return undefined;
  const flat: StyleRecord = {};
  flattenInto(style, flat);

  expandBox(flat, 'margin');
  expandBox(flat, 'padding');

  for (const [from, to] of Object.entries(LOGICAL_RENAMES)) {
    if (flat[from] === undefined) continue;
    flat[to] ??= flat[from];
    delete flat[from];
  }

  if (Array.isArray(flat.transform)) {
    flat.transform = flat.transform.map(transformFunction).join(' ');
  }
  if (Array.isArray(flat.transformOrigin)) {
    flat.transformOrigin = lengthList(flat.transformOrigin);
  }
  if (typeof flat.lineHeight === 'number') {
    flat.lineHeight = `${flat.lineHeight}px`;
  }
  if (flat.borderStyle === undefined) {
    if (flat.borderWidth != null) {
      flat.borderStyle = 'solid';
    } else {
      for (const side of SIDES) {
        if (flat[`border${side}Width`] != null) {
          flat[`border${side}Style`] = 'solid';
        }
      }
    }
  }

  return flat as CSSProperties;
}
