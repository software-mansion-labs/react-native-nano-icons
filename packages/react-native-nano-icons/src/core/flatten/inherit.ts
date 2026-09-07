// Ported from picosvg svg.py attribute-inheritance machinery
// (Apache-2.0, Copyright 2020 Google LLC)

import { ntos } from './geometry.js';
import { XEl, stripNs } from './dom.js';
import { Affine2D } from './transform.js';

// https://www.w3.org/TR/SVG11/paths.html - defaults per svg_meta.ATTRIB_DEFAULTS
export const ATTRIB_DEFAULTS: Record<string, string | number> = {
  'clip-path': '',
  'clip-rule': 'nonzero',
  fill: 'black',
  'fill-opacity': 1.0,
  'fill-rule': 'nonzero',
  stroke: 'none',
  'stroke-width': 1.0,
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-miterlimit': 4,
  'stroke-dasharray': 'none',
  'stroke-dashoffset': 0.0,
  'stroke-opacity': 1.0,
  opacity: 1.0,
  transform: '',
  style: '',
  display: 'inline',
  d: '',
  id: '',
};

export function attribDefault(name: string): string | number {
  const value = ATTRIB_DEFAULTS[name];
  if (value === undefined) {
    throw new Error(`No entry for '${name}' and no default given`);
  }
  return value;
}

const COMMON_SHAPE_FIELDS = [
  'id',
  'clip_path',
  'clip_rule',
  'fill',
  'fill_opacity',
  'fill_rule',
  'stroke',
  'stroke_width',
  'stroke_linecap',
  'stroke_linejoin',
  'stroke_miterlimit',
  'stroke_dasharray',
  'stroke_dashoffset',
  'stroke_opacity',
  'opacity',
  'transform',
  'style',
  'display',
];

// which field names are valid per tag - gates what inherits onto an element
const VALID_FIELDS: Record<string, Set<string>> = {
  path: new Set([...COMMON_SHAPE_FIELDS, 'd']),
  circle: new Set([...COMMON_SHAPE_FIELDS, 'r', 'cx', 'cy']),
  ellipse: new Set([...COMMON_SHAPE_FIELDS, 'rx', 'ry', 'cx', 'cy']),
  line: new Set([...COMMON_SHAPE_FIELDS, 'x1', 'y1', 'x2', 'y2']),
  polygon: new Set([...COMMON_SHAPE_FIELDS, 'points']),
  polyline: new Set([...COMMON_SHAPE_FIELDS, 'points']),
  rect: new Set([
    ...COMMON_SHAPE_FIELDS,
    'x',
    'y',
    'width',
    'height',
    'rx',
    'ry',
  ]),
  linearGradient: new Set([
    'id',
    'x1',
    'y1',
    'x2',
    'y2',
    'gradientTransform',
    'gradientUnits',
    'spreadMethod',
  ]),
  radialGradient: new Set([
    'id',
    'cx',
    'cy',
    'r',
    'fx',
    'fy',
    'fr',
    'gradientTransform',
    'gradientUnits',
    'spreadMethod',
  ]),
  stop: new Set(['offset', 'stop_color', 'stop_opacity']),
};

export function attrName(fieldName: string): string {
  return fieldName.replace(/_/g, '-');
}

export function fieldName(attr: string): string {
  return attr.replace(/-/g, '_');
}

function attrSupported(el: XEl, attr: string): boolean {
  const tag = stripNs(el.tag);
  const fields = VALID_FIELDS[tag];
  if (fields) {
    return fields.has(fieldName(attr));
  }
  return true; // we don't know
}

type Attrib = Record<string, string>;
type Handler = (attrib: Attrib, child: XEl, attr: string) => void;

function inheritCopy(attrib: Attrib, child: XEl, attr: string): void {
  if (child.attrib.has(attr)) return;
  if (attr in attrib) {
    child.attrib.set(attr, attrib[attr]!);
  }
}

function inheritMultiply(attrib: Attrib, child: XEl, attr: string): void {
  if (!(attr in attrib) && !child.attrib.has(attr)) return;
  let value = parseFloat(attrib[attr] ?? '1');
  value *= parseFloat(child.attrib.get(attr) ?? '1');
  child.attrib.set(attr, ntos(value));
}

function inheritClipPath(attrib: Attrib, child: XEl, _attr: string): void {
  const clips = [
    ...(child.attrib.get('clip-path') ?? '').split(','),
    attrib['clip-path'] ?? '',
  ].sort();
  child.attrib.set('clip-path', clips.filter((c) => c).join(','));
}

function inheritNondefaultOverflow(
  attrib: Attrib,
  child: XEl,
  attr: string
): void {
  const value = attrib[attr] ?? 'visible';
  if (value !== 'visible') {
    inheritCopy(attrib, child, attr);
  }
}

// https://github.com/googlefonts/picosvg/issues/260
function inheritNondefaultDisplay(
  attrib: Attrib,
  child: XEl,
  attr: string
): void {
  const value = attrib[attr] ?? '';
  if (value === 'none') {
    child.attrib.set(attr, value);
  } else {
    inheritCopy(attrib, child, attr);
  }
}

function inheritMatrixMultiply(attrib: Attrib, child: XEl, attr: string): void {
  let transform = Affine2D.identity();
  if (attr in attrib) {
    transform = Affine2D.fromString(attrib[attr]!);
  }
  if (child.attrib.has(attr)) {
    transform = Affine2D.composeLtr([
      Affine2D.fromString(child.attrib.get(attr)!),
      transform,
    ]);
  }
  if (!transform.equals(Affine2D.identity())) {
    child.attrib.set(attr, transform.toString());
  } else {
    child.attrib.delete(attr);
  }
}

const DO_NOT_INHERIT: Handler = () => {};

const INHERIT_ATTRIB_HANDLERS: Record<string, Handler> = {
  'clip-rule': inheritCopy,
  color: inheritCopy,
  display: inheritNondefaultDisplay,
  fill: inheritCopy,
  'fill-rule': inheritCopy,
  style: inheritCopy,
  transform: inheritMatrixMultiply,
  stroke: inheritCopy,
  'stroke-width': inheritCopy,
  'stroke-linecap': inheritCopy,
  'stroke-linejoin': inheritCopy,
  'stroke-miterlimit': inheritCopy,
  'stroke-dasharray': inheritCopy,
  'stroke-dashoffset': inheritCopy,
  'stroke-opacity': inheritCopy,
  'fill-opacity': inheritCopy,
  opacity: inheritMultiply,
  'clip-path': inheritClipPath,
  id: DO_NOT_INHERIT,
  'data-name': DO_NOT_INHERIT,
  'enable-background': DO_NOT_INHERIT,
  overflow: inheritNondefaultOverflow,
};

export const INHERITABLE_ATTRIB: ReadonlySet<string> = new Set(
  Object.entries(INHERIT_ATTRIB_HANDLERS)
    .filter(([, handler]) => handler !== DO_NOT_INHERIT)
    .map(([name]) => name)
);

export const ATTRIB_W_CUSTOM_INHERITANCE: ReadonlySet<string> = new Set([
  'clip-path',
  'opacity',
  'transform',
]);

// starting attrib for the root context: defaults of plain copy-inherited attrs
export const INHERITABLE_ATTRIB_DEFAULTS: Readonly<Attrib> = Object.fromEntries(
  Object.entries(INHERIT_ATTRIB_HANDLERS)
    .filter(
      ([name, handler]) => name in ATTRIB_DEFAULTS && handler === inheritCopy
    )
    .map(([name]) => {
      const value = ATTRIB_DEFAULTS[name]!;
      return [name, typeof value === 'number' ? ntos(value) : value];
    })
);

export function inheritAttrib(
  attrib: Attrib | Map<string, string>,
  child: XEl,
  skipUnhandled = false,
  skips: ReadonlySet<string> = new Set()
): void {
  const work: Attrib =
    attrib instanceof Map ? Object.fromEntries(attrib) : { ...attrib };
  for (const attr of Object.keys(work).sort()) {
    if (skips.has(attr) || !attrSupported(child, attr)) {
      delete work[attr];
      continue;
    }
    const handler = INHERIT_ATTRIB_HANDLERS[attr];
    if (!handler) {
      continue;
    }
    handler(work, child, attr);
    delete work[attr];
  }

  if (Object.keys(work).length && !skipUnhandled) {
    throw new Error(`Unable to process attrib ${JSON.stringify(work)}`);
  }
}

export function attribToPassOn(
  currentAttrib: Attrib,
  el: XEl,
  skips: ReadonlySet<string> = ATTRIB_W_CUSTOM_INHERITANCE
): Attrib {
  const attrCatcher = new XEl('dummy');
  inheritAttrib(el.attrib, attrCatcher, true, skips);
  inheritAttrib(currentAttrib, attrCatcher, false, skips);
  return Object.fromEntries(attrCatcher.attrib);
}

export function dropDefaultAttrib(attrib: Map<string, string>): void {
  for (const attr of [...attrib.keys()].sort()) {
    const defaultValue = ATTRIB_DEFAULTS[attr];
    if (defaultValue === undefined) continue;
    const value = attrib.get(attr)!;
    if (typeof defaultValue === 'number') {
      if (parseFloat(value) === defaultValue) attrib.delete(attr);
    } else if (value === defaultValue) {
      attrib.delete(attr);
    }
  }
}
