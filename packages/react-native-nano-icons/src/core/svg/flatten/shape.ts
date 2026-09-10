// Ported from picosvg svg_types.py shape model (Apache-2.0, Copyright 2020 Google LLC)

import { ntos, pythonRound } from './geometry.js';
import { XEl, svgTag, stripNs } from './dom.js';
import { attribDefault, attrName } from './inherit.js';
import type { PathOps } from './pathops.js';
import type { SvgCommand } from './path.js';
import {
  absolutePath,
  addCmdToD,
  asCmdSeq,
  buildD,
  explicitLines,
  expandShorthand,
  parseSvgPath,
  pathSegment,
  roundFloatsD,
  subpaths,
} from './path.js';
import { Affine2D } from './transform.js';

type FieldType = 'str' | 'float';
type FieldDesc = { name: string; type: FieldType; default: string | number };

const f = (
  name: string,
  type: FieldType,
  dflt: string | number
): FieldDesc => ({ name, type, default: dflt });

// dataclass field order of SVGShape - drives to_element attribute order
const COMMON_FIELDS: FieldDesc[] = [
  f('id', 'str', ''),
  f('clip_path', 'str', attribDefault('clip-path')),
  f('clip_rule', 'str', attribDefault('clip-rule')),
  f('fill', 'str', attribDefault('fill')),
  f('fill_opacity', 'float', attribDefault('fill-opacity')),
  f('fill_rule', 'str', attribDefault('fill-rule')),
  f('stroke', 'str', attribDefault('stroke')),
  f('stroke_width', 'float', attribDefault('stroke-width')),
  f('stroke_linecap', 'str', attribDefault('stroke-linecap')),
  f('stroke_linejoin', 'str', attribDefault('stroke-linejoin')),
  f('stroke_miterlimit', 'float', attribDefault('stroke-miterlimit')),
  f('stroke_dasharray', 'str', attribDefault('stroke-dasharray')),
  f('stroke_dashoffset', 'float', attribDefault('stroke-dashoffset')),
  f('stroke_opacity', 'float', attribDefault('stroke-opacity')),
  f('opacity', 'float', attribDefault('opacity')),
  f('transform', 'str', attribDefault('transform')),
  f('style', 'str', attribDefault('style')),
  f('display', 'str', attribDefault('display')),
];

const TAG_FIELDS: Record<string, FieldDesc[]> = {
  path: [f('d', 'str', '')],
  circle: [f('r', 'float', 0), f('cx', 'float', 0), f('cy', 'float', 0)],
  ellipse: [
    f('rx', 'float', 0),
    f('ry', 'float', 0),
    f('cx', 'float', 0),
    f('cy', 'float', 0),
  ],
  line: [
    f('x1', 'float', 0),
    f('y1', 'float', 0),
    f('x2', 'float', 0),
    f('y2', 'float', 0),
  ],
  polygon: [f('points', 'str', '')],
  polyline: [f('points', 'str', '')],
  rect: [
    f('x', 'float', 0),
    f('y', 'float', 0),
    f('width', 'float', 0),
    f('height', 'float', 0),
    f('rx', 'float', 0),
    f('ry', 'float', 0),
  ],
};

export const SHAPE_TAGS: ReadonlySet<string> = new Set(Object.keys(TAG_FIELDS));

export function isShapeTag(tag: string): boolean {
  return SHAPE_TAGS.has(stripNs(tag));
}

export type Shape = {
  tag: string;
  fields: Record<string, string | number>;
};

export function shapeFields(tag: string): FieldDesc[] {
  const extra = TAG_FIELDS[tag];
  if (!extra) throw new Error(`Bad tag <${tag}>`);
  return [...COMMON_FIELDS, ...extra];
}

function newShape(tag: string): Shape {
  const fields: Record<string, string | number> = {};
  for (const field of shapeFields(tag)) {
    fields[field.name] = field.default;
  }
  return { tag, fields };
}

export function shapeStr(shape: Shape, name: string): string {
  return shape.fields[name] as string;
}

export function shapeNum(shape: Shape, name: string): number {
  return shape.fields[name] as number;
}

export function cloneShape(shape: Shape): Shape {
  return { tag: shape.tag, fields: { ...shape.fields } };
}

export function shapesEqual(a: Shape, b: Shape): boolean {
  if (a.tag !== b.tag) return false;
  for (const field of shapeFields(a.tag)) {
    if (a.fields[field.name] !== b.fields[field.name]) return false;
  }
  return true;
}

function parseFloatStrict(raw: string): number {
  const value = Number(raw.trim());
  if (Number.isNaN(value)) {
    throw new Error(`could not convert string to float: '${raw}'`);
  }
  return value;
}

export function fromElement(
  el: XEl,
  inheritedAttrib: Record<string, string> = {}
): Shape {
  if (!isShapeTag(el.tag)) {
    throw new Error(`Bad tag <${el.tag}>`);
  }
  const tag = stripNs(el.tag);
  const attrs: Record<string, string> = { ...inheritedAttrib };
  for (const [name, value] of el.attrib) {
    attrs[name] = value;
  }
  const shape = newShape(tag);
  for (const field of shapeFields(tag)) {
    const raw = attrs[attrName(field.name)];
    if (raw === undefined || !raw.trim()) continue;
    shape.fields[field.name] =
      field.type === 'float' ? parseFloatStrict(raw) : raw;
  }
  if (tag === 'rect') {
    rectPostInit(shape);
  }
  return shape;
}

// SVGRect.__post_init__
function rectPostInit(shape: Shape): void {
  if (!shapeNum(shape, 'rx')) shape.fields.rx = shapeNum(shape, 'ry');
  if (!shapeNum(shape, 'ry')) shape.fields.ry = shapeNum(shape, 'rx');
  shape.fields.rx = Math.min(
    shapeNum(shape, 'rx'),
    shapeNum(shape, 'width') / 2
  );
  shape.fields.ry = Math.min(
    shapeNum(shape, 'ry'),
    shapeNum(shape, 'height') / 2
  );
}

export function toElement(
  shape: Shape,
  inheritedAttrib: Record<string, string> = {}
): XEl {
  const el = new XEl(svgTag(shape.tag));
  for (const field of shapeFields(shape.tag)) {
    const attr = attrName(field.name);
    const fieldValue = shape.fields[field.name]!;
    // omit attributes whose value == the respective default,
    // unless it's != from the attribute value inherited from context
    const attribValue =
      typeof fieldValue === 'number' ? ntos(fieldValue) : fieldValue;
    if (attr in inheritedAttrib) {
      if (attribValue === inheritedAttrib[attr]) continue;
    } else if (fieldValue === field.default) {
      continue;
    }
    el.attrib.set(attr, attribValue);
  }
  return el;
}

export function resetFields(
  shape: Shape,
  pred: (fieldName: string) => boolean
): void {
  for (const field of shapeFields(shape.tag)) {
    if (pred(field.name)) {
      shape.fields[field.name] = field.default;
    }
  }
}

// ---- geometry ----

function copyCommonFields(target: Shape, source: Shape): void {
  for (const field of COMMON_FIELDS) {
    target.fields[field.name] = source.fields[field.name]!;
  }
}

function pathFromD(d: string): Shape {
  const path = newShape('path');
  path.fields.d = d;
  return path;
}

export function pathFromCommands(cmds: Iterable<SvgCommand>): Shape {
  return pathFromD(buildD(cmds));
}

export function asPath(shape: Shape): Shape {
  if (shape.tag === 'path') {
    return shape;
  }

  const fields = shape.fields;
  let d = '';
  const add = (cmd: string, ...args: number[]) => {
    d = addCmdToD(d, cmd, args);
  };
  const addArc = (rx: number, ry: number, x: number, y: number, large = 0) => {
    const snippet = pathSegment('A', rx, ry, 0, large, 1, x, y);
    d = d ? `${d} ${snippet}` : snippet;
  };

  switch (shape.tag) {
    case 'circle':
    case 'ellipse': {
      const rx = (shape.tag === 'circle' ? fields.r : fields.rx) as number;
      const ry = (shape.tag === 'circle' ? fields.r : fields.ry) as number;
      const cx = fields.cx as number;
      const cy = fields.cy as number;
      // arc doesn't seem to like being a complete shape, draw two halves
      add('M', cx + rx, cy);
      addArc(rx, ry, cx - rx, cy, 1);
      addArc(rx, ry, cx + rx, cy, 1);
      d = `${d} Z`;
      break;
    }
    case 'line': {
      add('M', fields.x1 as number, fields.y1 as number);
      add('L', fields.x2 as number, fields.y2 as number);
      break;
    }
    case 'polygon': {
      d = fields.points ? `M${fields.points} Z` : '';
      break;
    }
    case 'polyline': {
      d = fields.points ? `M${fields.points}` : '';
      break;
    }
    case 'rect': {
      const x = fields.x as number;
      const y = fields.y as number;
      const w = fields.width as number;
      const h = fields.height as number;
      const rx = fields.rx as number;
      const ry = fields.ry as number;
      add('M', x + rx, y);
      add('H', x + w - rx);
      if (rx > 0) addArc(rx, ry, x + w, y + ry);
      add('V', y + h - ry);
      if (rx > 0) addArc(rx, ry, x + w - rx, y + h);
      add('H', x + rx);
      if (rx > 0) addArc(rx, ry, x, y + h - ry);
      add('V', y + ry);
      if (rx > 0) addArc(rx, ry, x + rx, y);
      d = `${d} Z`;
      break;
    }
    default:
      throw new Error(`as_path not implemented for <${shape.tag}>`);
  }

  const path = pathFromD(d);
  copyCommonFields(path, shape);
  return path;
}

// hHvV -> lL, S/T -> C/Q, relative -> absolute, arcs -> cubics
export function shapeCmdSeq(shape: Shape): SvgCommand[] {
  return asCmdSeq(shapeStr(asPath(shape), 'd'));
}

export function absoluteShape(shape: Shape): Shape {
  // only meaningful for path
  if (shape.tag !== 'path') return shape;
  const target = cloneShape(shape);
  target.fields.d = absolutePath(shapeStr(target, 'd'));
  return target;
}

export function explicitLinesExpandShorthand(shape: Shape): Shape {
  if (shape.tag !== 'path') return shape;
  const target = cloneShape(shape);
  target.fields.d = expandShorthand(explicitLines(shapeStr(target, 'd')));
  return target;
}

export function applyTransform(
  shape: Shape,
  transform: Affine2D,
  ops: PathOps
): Shape {
  let target = asPath(shape);
  if (target === shape) {
    target = cloneShape(target);
  }
  let cmds: SvgCommand[] = [['M', [0, 0]]];
  if (!transform.isDegenerate()) {
    cmds = ops.transformCmds(shapeCmdSeq(shape), transform);
  }
  target.fields.d = buildD(cmds);
  return target;
}

export function removeOverlaps(shape: Shape, ops: PathOps): Shape {
  const cmds = ops.removeOverlaps(
    shapeCmdSeq(shape),
    shapeStr(shape, 'fill_rule')
  );
  const target = cloneShape(asPath(shape));
  // simplified paths follow the 'nonzero' winding rule
  target.fields.fill_rule = 'nonzero';
  target.fields.clip_rule = 'nonzero';
  target.fields.d = buildD(cmds);
  return target;
}

export function strokeCommands(
  shape: Shape,
  tolerance: number,
  ops: PathOps
): SvgCommand[] {
  let dashArray: number[] = [];
  const dasharray = shapeStr(shape, 'stroke_dasharray');
  if (dasharray !== 'none') {
    dashArray = dasharray
      .split(/[, ]/)
      .filter((v) => v)
      .map((v) => parseFloatStrict(v));
  }
  // odd number of dash values is repeated to yield an even count
  if (dashArray.length % 2 !== 0) {
    dashArray = [...dashArray, ...dashArray];
  }

  return ops.strokeCmds(
    shapeCmdSeq(shape),
    shapeStr(shape, 'stroke_linecap'),
    shapeStr(shape, 'stroke_linejoin'),
    shapeNum(shape, 'stroke_width'),
    shapeNum(shape, 'stroke_miterlimit'),
    tolerance,
    dashArray,
    shapeNum(shape, 'stroke_dashoffset')
  );
}

// CSS in "style" attribute -> equivalent SVG attributes on the shape
export function parseCssDeclarations(
  style: string,
  output: Record<string, string>,
  propertyNames?: ReadonlySet<string>
): string {
  const unparsed: string[] = [];
  for (let declaration of style.split(';')) {
    declaration = declaration.trim();
    const colonCount = (declaration.match(/:/g) ?? []).length;
    if (colonCount === 1) {
      const [rawName, rawValue] = declaration.split(':') as [string, string];
      const propertyName = rawName.trim();
      const value = rawValue.trim();
      if (propertyNames === undefined || propertyNames.has(propertyName)) {
        output[propertyName] = value;
      } else {
        unparsed.push(declaration);
      }
    } else if (declaration) {
      throw new Error(`Invalid CSS declaration syntax: ${declaration}`);
    }
  }
  return unparsed.length ? unparsed.join('; ') + ';' : '';
}

export function applyStyleAttribute(shape: Shape): Shape {
  const target = cloneShape(shape);
  const style = shapeStr(target, 'style');
  if (style) {
    const fields = shapeFields(target.tag);
    const attrTypes = new Map(fields.map((fd) => [attrName(fd.name), fd]));
    const rawAttrs: Record<string, string> = {};
    const unparsedStyle = parseCssDeclarations(
      style,
      rawAttrs,
      new Set(attrTypes.keys())
    );
    for (const [attr, rawValue] of Object.entries(rawAttrs)) {
      const field = attrTypes.get(attr)!;
      target.fields[field.name] =
        field.type === 'float' ? parseFloatStrict(rawValue) : rawValue;
    }
    target.fields.style = unparsedStyle;
  }
  return target;
}

// False if we're sure this shape will not paint. True if it *might* paint.
export function mightPaint(shape: Shape, ops: PathOps): boolean {
  const styled = applyStyleAttribute(shape);

  if (shapeStr(styled, 'display') === 'none') return false;

  const visible = (fill: string, opacity: number) =>
    fill !== 'none' && shapeNum(styled, 'opacity') * opacity !== 0;

  // if all you do is move the pen around you can't draw
  const cmds = shapeCmdSeq(shape);
  if (cmds.every(([c]) => c.toUpperCase() === 'M')) return false;

  // Does it look like the stroke is visible?
  if (
    visible(shapeStr(styled, 'stroke'), shapeNum(styled, 'stroke_opacity')) &&
    shapeNum(styled, 'stroke_width') !== 0
  ) {
    return true;
  }

  // No stroke; if the shape is hidden we can't draw
  if (!visible(shapeStr(styled, 'fill'), shapeNum(styled, 'fill_opacity'))) {
    return false;
  }

  // Only shapes with area paint
  return ops.pathArea(shapeCmdSeq(styled), shapeStr(styled, 'fill_rule')) > 0;
}

// Merge '{fill,stroke}_opacity' with generic 'opacity' when possible
export function normalizeOpacity(shape: Shape): void {
  if (
    shapeStr(shape, 'fill') === 'none' &&
    shapeStr(shape, 'stroke') === 'none'
  ) {
    return;
  }

  for (const [fillAttr, opacityAttr] of [
    ['fill', 'stroke_opacity'],
    ['stroke', 'fill_opacity'],
  ] as const) {
    if (shapeStr(shape, fillAttr) === 'none') {
      shape.fields.opacity =
        shapeNum(shape, 'opacity') * shapeNum(shape, opacityAttr);
      shape.fields[opacityAttr] = 1.0;
    }
  }
}

export function roundShapeFloats(shape: Shape, ndigits: number): void {
  for (const field of shapeFields(shape.tag)) {
    const value = shape.fields[field.name];
    if (field.type === 'float' && typeof value === 'number') {
      shape.fields[field.name] = pythonRound(value, ndigits);
    }
  }
  if (shape.tag === 'path') {
    shape.fields.d = roundFloatsD(shapeStr(shape, 'd'), ndigits);
  }
}

export function removeEmptySubpaths(shape: Shape, ops: PathOps): void {
  if (shape.tag !== 'path') return;
  shape.fields.d = subpaths(shapeStr(shape, 'd'))
    .filter((sub) => mightPaint(pathFromD(sub), ops))
    .join(' ');
}

// exploded iteration like SVGPath.__iter__
export function iterPath(shape: Shape): SvgCommand[] {
  return parseSvgPath(shapeStr(asPath(shape), 'd'), true);
}
