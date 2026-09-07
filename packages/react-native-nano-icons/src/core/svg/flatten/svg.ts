// Ported from picosvg svg.py (Apache-2.0, Copyright 2020 Google LLC).
// Minimal-subset port: gradient normalization is skipped (fills keep their
// url(#...) strings, downstream never reads gradient defs) and nested <svg>
// elements are rejected instead of resolved.

import type { Rect } from './geometry.js';
import { ntos } from './geometry.js';
import {
  XEl,
  SVG_NS,
  delAttrs,
  findAll,
  parseSvgDocument,
  replaceEl,
  safeRemove,
  serializeSvg,
  splitNs,
  stripNs,
  svgTag,
  xlinkHrefAttr,
  XLINK_NS,
} from './dom.js';
import {
  INHERITABLE_ATTRIB,
  INHERITABLE_ATTRIB_DEFAULTS,
  attribToPassOn,
  dropDefaultAttrib,
  inheritAttrib,
} from './inherit.js';
import type { PathOps } from './pathops.js';
import type { Shape } from './shape.js';
import {
  absoluteShape,
  applyStyleAttribute,
  applyTransform,
  asPath,
  cloneShape,
  explicitLinesExpandShorthand,
  fromElement,
  isShapeTag,
  mightPaint,
  normalizeOpacity,
  parseCssDeclarations,
  pathFromCommands,
  removeEmptySubpaths,
  removeOverlaps,
  resetFields,
  roundShapeFloats,
  shapeCmdSeq,
  shapeStr,
  shapesEqual,
  strokeCommands,
  toElement,
} from './shape.js';
import { Affine2D } from './transform.js';

// How much error, as pct of viewbox max(w,h), is allowed on lossy ops
const MAX_PCT_ERROR = 0.1;
// When you have no viewbox, use this. Absolute value in svg units.
const DEFAULT_DEFAULT_TOLERANCE = 0.1;

const GRADIENT_TAGS = new Set(['linearGradient', 'radialGradient']);

function clamp(value: number, minv = 0.0, maxv = 1.0): number {
  return Math.max(Math.min(value, maxv), minv);
}

function isDefs(tag: string): boolean {
  return stripNs(tag) === 'defs';
}

function isGradient(tag: string): boolean {
  return GRADIENT_TAGS.has(stripNs(tag));
}

function isGroup(tag: string): boolean {
  return stripNs(tag) === 'g';
}

function elOpacity(el: XEl): number {
  return clamp(parseFloat(el.attrib.get('opacity') ?? '1'));
}

// Groups with 0 < opacity < 1 and >1 child must be retained.
// This over-retains groups; no difference unless children overlap.
function isRemovableGroup(el: XEl): boolean {
  if (!isGroup(el.tag)) return false;
  // no attributes makes a group meaningless
  if (el.attrib.size === 0) return true;
  const numChildren = el.children.length;
  const opacity = elOpacity(el);
  return numChildren <= 1 || opacity === 0.0 || opacity === 1.0;
}

function tryRemoveGroup(groupEl: XEl, pushOpacity = true): boolean {
  const remove = isRemovableGroup(groupEl);
  const opacity = elOpacity(groupEl);
  if (remove) {
    const children = [...groupEl.children];
    if (groupEl.parent !== null) {
      replaceEl(groupEl, children);
    }
    if (pushOpacity) {
      for (const child of children) {
        inheritAttrib({ opacity: ntos(opacity) }, child);
      }
    }
  } else {
    // We're keeping the group, but we promised groups only have opacity
    groupEl.attrib.clear();
    groupEl.attrib.set('opacity', ntos(opacity));
    dropDefaultAttrib(groupEl.attrib);
  }
  return remove;
}

function elementTransform(
  el: XEl,
  currentTransform = Affine2D.identity()
): Affine2D {
  const attr = isGradient(el.tag) ? 'gradientTransform' : 'transform';
  const raw = el.attrib.get(attr);
  if (raw) {
    return Affine2D.composeLtr([Affine2D.fromString(raw), currentTransform]);
  }
  return currentTransform;
}

function idOfTarget(url: string): string {
  const match = /^url[(]#([\w-]+)[)]$/.exec(url);
  if (!match) {
    throw new Error(`Unrecognized url "${url}"`);
  }
  return match[1]!;
}

function parseViewBox(s: string): Rect {
  const box = s
    .split(/,|\s+/)
    .filter((v) => v)
    .map((v) => parseFloat(v));
  if (box.length !== 4 || box.some((v) => Number.isNaN(v))) {
    throw new Error(`Unable to parse viewBox: ${s}`);
  }
  return { x: box[0]!, y: box[1]!, w: box[2]!, h: box[3]! };
}

type TraverseContext = {
  nthOfType: number;
  element: XEl;
  path: string;
  transform: Affine2D;
  clips: Shape[];
  attrib: Record<string, string>; // except clip-path/opacity/transform
};

export class PicoSVG {
  svgRoot: XEl;
  private elements: Array<[XEl, Shape[]]> | null = null;
  private readonly ops: PathOps;

  constructor(svgRoot: XEl, ops: PathOps) {
    this.svgRoot = svgRoot;
    this.ops = ops;
  }

  static fromString(content: string, ops: PathOps): PicoSVG {
    return new PicoSVG(parseSvgDocument(content), ops);
  }

  // ---- shape/element cache sync (svg.py _elements/_update_etree) ----

  private _elements(): Array<[XEl, Shape[]]> {
    if (this.elements) {
      return this.elements;
    }
    const elements: Array<[XEl, Shape[]]> = [];
    for (const context of this.depthFirst(false)) {
      const el = context.element;
      if (!isShapeTag(el.tag)) continue;
      elements.push([el, [fromElement(el, context.attrib)]]);
    }
    this.elements = elements;
    return this.elements;
  }

  private _inheritedAttrib(el: XEl): Record<string, string> {
    const parents: XEl[] = [];
    let current = el.parent;
    while (current !== null) {
      parents.push(current);
      current = current.parent;
    }
    let attrib: Record<string, string> = { ...INHERITABLE_ATTRIB_DEFAULTS };
    for (const parent of parents.reverse()) {
      attrib = attribToPassOn(attrib, parent);
    }
    return attrib;
  }

  private _updateEtree(): void {
    if (!this.elements) return;
    for (const [oldEl, shapes] of this.elements) {
      const inherited = this._inheritedAttrib(oldEl);
      replaceEl(
        oldEl,
        shapes.map((s) => toElement(s, inherited))
      );
    }
    this.elements = null;
  }

  // ---- geometry context ----

  viewBox(): Rect | null {
    const raw = this.svgRoot.attrib.get('viewBox');
    if (raw === undefined) {
      const w = this.svgRoot.attrib.get('width');
      const h = this.svgRoot.attrib.get('height');
      if (w && h) {
        return { x: 0, y: 0, w: parseFloat(w), h: parseFloat(h) };
      }
      return null;
    }
    return parseViewBox(raw);
  }

  get tolerance(): number {
    const vbox = this.viewBox();
    if (vbox === null) return DEFAULT_DEFAULT_TOLERANCE;
    return (Math.min(vbox.w, vbox.h) * MAX_PCT_ERROR) / 100;
  }

  // ---- xpath-lite helpers ----

  private resolveUrl(url: string, elTag: string): XEl {
    const id = idOfTarget(url);
    const matches = findAll(
      this.svgRoot,
      (el) =>
        el.attrib.get('id') === id &&
        (elTag === '*' || stripNs(el.tag) === elTag)
    );
    if (matches.length !== 1) {
      throw new Error(
        `Expected 1 match for url(#${id}) ${elTag}, got ${matches.length}`
      );
    }
    return matches[0]!;
  }

  // ---- traversal ----

  private *_traverse(
    nextFn: (frontier: TraverseContext[]) => TraverseContext,
    appendFn: (frontier: TraverseContext[], entries: TraverseContext[]) => void,
    resolveClipPaths: boolean
  ): Generator<TraverseContext, void, void> {
    const frontier: TraverseContext[] = [
      {
        nthOfType: 0,
        element: this.svgRoot,
        path: '/svg[0]',
        transform: Affine2D.identity(),
        clips: [],
        attrib: attribToPassOn(
          { ...INHERITABLE_ATTRIB_DEFAULTS },
          this.svgRoot
        ),
      },
    ];
    while (frontier.length) {
      const context = nextFn(frontier);
      yield context;

      const childIdxs: Record<string, number> = {};
      const newEntries: TraverseContext[] = [];
      for (const child of context.element.children) {
        const transform = elementTransform(child, context.transform);
        let clips = context.clips;
        const clipPathAttr = child.attrib.get('clip-path');
        if (resolveClipPaths && clipPathAttr && clipPathAttr !== 'none') {
          clips = [...clips, this._resolveClipPath(clipPathAttr, transform)];
        }

        const localName = stripNs(child.tag);
        const nthOfType = childIdxs[localName] ?? 0;
        childIdxs[localName] = nthOfType + 1;
        newEntries.push({
          nthOfType,
          element: child,
          path: `${context.path}/${localName}[${nthOfType}]`,
          transform,
          clips,
          attrib: attribToPassOn(context.attrib, child),
        });
      }
      appendFn(frontier, newEntries);
    }
  }

  depthFirst(resolveClipPaths = true): Generator<TraverseContext, void, void> {
    // dfs takes from the back; reverse so children still yield in order
    return this._traverse(
      (f) => f.pop()!,
      (f, e) => f.push(...e.reverse()),
      resolveClipPaths
    );
  }

  breadthFirst(
    resolveClipPaths = true
  ): Generator<TraverseContext, void, void> {
    return this._traverse(
      (f) => f.shift()!,
      (f, e) => f.push(...e),
      resolveClipPaths
    );
  }

  // ---- use resolution ----

  private _resolveUse(scopeEl: XEl): void {
    const attribNotCopied = new Set([
      'x',
      'y',
      'width',
      'height',
      'transform',
      xlinkHrefAttr(),
    ]);

    // capture elements by id so even if we change it they remain stable
    const elById = new Map<string, XEl>();
    for (const el of findAll(this.svgRoot, (e) => e.attrib.has('id'))) {
      elById.set(el.attrib.get('id')!, el);
    }

    for (;;) {
      const useEls = findAll(scopeEl, (e) => stripNs(e.tag) === 'use');
      if (!useEls.length) break;
      const swaps: Array<[XEl, XEl]> = [];
      for (const useEl of useEls) {
        const ref = useEl.attrib.get(xlinkHrefAttr()) ?? '';
        if (!ref.startsWith('#')) {
          throw new Error(`Only use #fragment supported, reject ${ref}`);
        }

        const target = elById.get(ref.slice(1));
        if (target === undefined) {
          throw new Error(`No element has id '${ref.slice(1)}'`);
        }

        const newEl = target.deepClone();
        // leaving ids on <use> instantiated content duplicates ids
        for (const el of newEl.iter()) {
          el.attrib.delete('id');
        }

        const group = new XEl(svgTag('g'));
        let affine = Affine2D.identity().translate(
          parseFloat(useEl.attrib.get('x') ?? '0'),
          parseFloat(useEl.attrib.get('y') ?? '0')
        );

        const useTransform = useEl.attrib.get('transform');
        if (useTransform !== undefined) {
          affine = Affine2D.composeLtr([
            affine,
            Affine2D.fromString(useTransform),
          ]);
        }

        if (!affine.equals(Affine2D.identity())) {
          group.attrib.set('transform', affine.toString());
        }

        for (const [name, value] of useEl.attrib) {
          if (attribNotCopied.has(name)) continue;
          group.attrib.set(name, value);
        }

        group.append(newEl);

        if (tryRemoveGroup(group, false)) {
          inheritAttrib(group.attrib, newEl);
          swaps.push([useEl, newEl]);
        } else {
          swaps.push([useEl, group]);
        }
      }

      for (const [oldEl, newEl] of swaps) {
        replaceEl(oldEl, [newEl]);
      }
    }
  }

  resolveUse(): void {
    this._updateEtree();
    this._resolveUse(this.svgRoot);
  }

  // ---- clip paths ----

  private _resolveClipPath(
    clipPathUrl: string,
    transform = Affine2D.identity()
  ): Shape {
    const clipPathEl = this.resolveUrl(clipPathUrl, 'clipPath');
    this._resolveUse(clipPathEl);

    const clipTransform = elementTransform(clipPathEl, transform);
    const clipShapes = clipPathEl.children.map((e) =>
      applyTransform(
        fromElement(e),
        elementTransform(e, clipTransform),
        this.ops
      )
    );

    let clip = pathFromCommands(
      this.ops.union(
        clipShapes.map((s) => shapeCmdSeq(s)),
        clipShapes.map((s) => shapeStr(s, 'clip_rule'))
      )
    );

    const nestedClip = clipPathEl.attrib.get('clip-path');
    if (nestedClip !== undefined) {
      const clipClop = this._resolveClipPath(nestedClip, clipTransform);
      clip = pathFromCommands(
        this.ops.intersection(
          [shapeCmdSeq(clip), shapeCmdSeq(clipClop)],
          [shapeStr(clip, 'clip_rule'), shapeStr(clipClop, 'clip_rule')]
        )
      );
    }

    return clip;
  }

  // ---- topicosvg passes ----

  removeNonSvgContent(): void {
    this._updateEtree();

    const goodNs = new Set<string | null>([SVG_NS, XLINK_NS]);
    if (splitNs(this.svgRoot.tag)[0] === SVG_NS) {
      goodNs.add(null);
    }

    const elToRm: XEl[] = [];
    for (const el of this.svgRoot.iter()) {
      if (el === this.svgRoot) continue;
      if (!goodNs.has(splitNs(el.tag)[0])) {
        elToRm.push(el);
        continue;
      }
      this._removeBadAttrs(el, goodNs);
    }
    this._removeBadAttrs(this.svgRoot, goodNs);

    for (const el of elToRm) {
      safeRemove(el);
    }

    this.elements = null;
  }

  private _removeBadAttrs(el: XEl, goodNs: ReadonlySet<string | null>): void {
    const attrToRm: string[] = [];
    for (const attr of el.attrib.keys()) {
      if (!goodNs.has(splitNs(attr)[0])) {
        attrToRm.push(attr);
      }
    }
    delAttrs(el, ...attrToRm);
  }

  removeAnonymousSymbols(): void {
    this._updateEtree();
    for (const el of findAll(
      this.svgRoot,
      (e) => stripNs(e.tag) === 'symbol' && !e.attrib.has('id')
    )) {
      safeRemove(el);
    }
  }

  removeTitleMetaDesc(): void {
    this._updateEtree();
    const tags = new Set(['title', 'desc', 'metadata', 'comment']);
    for (const el of findAll(this.svgRoot, (e) => tags.has(stripNs(e.tag)))) {
      safeRemove(el);
    }
  }

  applyStyleAttributes(): void {
    if (this.elements) {
      // if we already parsed shapes, apply style attrs and sync tree
      for (const entry of this.elements) {
        entry[1] = entry[1].map((s) => applyStyleAttribute(s));
      }
      this._updateEtree();
    }

    const styled = [
      this.svgRoot,
      ...findAll(this.svgRoot, (e) => e.attrib.has('style')),
    ];
    for (const el of styled) {
      this._applyStyles(el);
    }
  }

  private _applyStyles(el: XEl): void {
    const style = el.attrib.get('style') ?? '';
    el.attrib.delete('style');
    const parsed: Record<string, string> = {};
    parseCssDeclarations(style, parsed); // unparsed remnants are dropped here
    for (const [name, value] of Object.entries(parsed)) {
      // lxml silently rejects invalid attribute names (e.g. -inkscape-*)
      if (/^[A-Za-z_][\w.-]*$/.test(name)) {
        el.attrib.set(name, value);
      }
    }
  }

  rejectNestedSvgs(): void {
    // deviation from picosvg (which resolves them): unsupported here
    for (const el of this.svgRoot.iter()) {
      if (el !== this.svgRoot && stripNs(el.tag) === 'svg') {
        throw new Error('nested <svg> elements are not supported');
      }
    }
  }

  shapesToPaths(): void {
    const elements = this._elements();
    elements.forEach(([el, shapes], idx) => {
      elements[idx] = [el, shapes.map((s) => asPath(s))];
    });
  }

  expandShorthand(): void {
    const elements = this._elements();
    elements.forEach(([el, shapes], idx) => {
      elements[idx] = [
        el,
        shapes.map((s) =>
          s.tag === 'path' ? explicitLinesExpandShorthand(s) : s
        ),
      ];
    });
  }

  // ---- simplify (the core) ----

  private _stroke(shape: Shape): Shape[] {
    // convert stroke to path; returns shapes in draw order
    const stroke = cloneShape(asPath(shape));
    stroke.fields.d = pathFromCommands(
      strokeCommands(shape, this.tolerance, this.ops)
    ).fields.d!;

    // skia stroker returns paths with 'nonzero' winding fill rule
    stroke.fields.fill_rule = 'nonzero';
    stroke.fields.clip_rule = 'nonzero';

    // a few attributes move in interesting ways
    stroke.fields.opacity =
      (stroke.fields.opacity as number) *
      (stroke.fields.stroke_opacity as number);
    stroke.fields.fill = stroke.fields.stroke!;
    // fill and stroke are now different (filled) paths; fold fill_opacity
    // into opacity on each
    shape.fields.opacity =
      (shape.fields.opacity as number) * (shape.fields.fill_opacity as number);
    shape.fields.fill_opacity = 1.0;
    stroke.fields.fill_opacity = 1.0;

    // remove all the stroke settings
    for (const cleanmeup of [shape, stroke]) {
      resetFields(cleanmeup, (name) => name.startsWith('stroke'));
    }

    if (!mightPaint(shape, this.ops)) {
      return [stroke];
    }

    // The original id doesn't correctly refer to either
    shape.fields.id = '';
    stroke.fields.id = '';

    return [shape, stroke];
  }

  simplify(): void {
    this._updateEtree();
    this._simplify();
  }

  private _simplify(): void {
    // Reversed: we want leaves first. Materialize BEFORE mutating.
    const toProcess = [...this.breadthFirst()].reverse();

    const defs = new XEl(svgTag('defs'));
    this.svgRoot.insert(0, defs);

    for (const context of toProcess) {
      if (context.path.includes('clipPath')) {
        safeRemove(context.element);
        continue;
      }

      const el = context.element;
      delAttrs(el, 'clip-path', 'transform'); // handled separately
      inheritAttrib(context.attrib, el);

      if (isShapeTag(el.tag)) {
        if (el.children.length) {
          throw new Error("Shapes shouldn't have children");
        }

        // NOTE: picosvg would emit a transformed gradient here when a
        // transformed shape uses a gradient fill; descoped in this port.

        const paths: Shape[] = [absoluteShape(asPath(fromElement(el)))];
        const initialPath = cloneShape(paths[0]!);

        // stroke may introduce multiple paths
        if (shapeStr(paths[0]!, 'stroke') !== 'none') {
          paths.splice(0, paths.length, ...this._stroke(paths[0]!));
        }

        // Any remaining stroke attributes don't do anything
        for (const path of paths) {
          resetFields(path, (name) => name.startsWith('stroke'));
        }

        // Apply any transform
        if (!context.transform.equals(Affine2D.identity())) {
          paths.forEach((p, i) => {
            paths[i] = applyTransform(p, context.transform, this.ops);
          });
        }

        if (context.clips.length) {
          for (const p of paths) {
            // fill-rule for the shape to be clipped, clip-rule for the
            // clipping paths themselves
            const cmds = this.ops.intersection(
              [shapeCmdSeq(p), ...context.clips.map((c) => shapeCmdSeq(c))],
              [
                shapeStr(p, 'fill_rule'),
                ...context.clips.map((c) => shapeStr(c, 'clip_rule')),
              ]
            );
            p.fields.d = pathFromCommands(cmds).fields.d!;
            // skia-pathops operations always return nonzero winding paths
            p.fields.fill_rule = 'nonzero';
          }
        }

        if (paths.length !== 1 || !shapesEqual(paths[0]!, initialPath)) {
          replaceEl(
            el,
            paths.map((p) => toElement(p))
          );
        }
      } else if (isGradient(el.tag)) {
        safeRemove(el);
        this._addToDefs(defs, el);
      } else if (isDefs(el.tag)) {
        // children were already processed; move them to master defs
        for (const childEl of [...el.children]) {
          this._addToDefs(defs, childEl);
        }
        safeRemove(el);
      } else if (isGroup(el.tag)) {
        tryRemoveGroup(el);
      }
    }

    // https://github.com/googlefonts/nanoemoji/issues/275
    delAttrs(this.svgRoot, ...INHERITABLE_ATTRIB);

    this._removeOrphanedGradients();

    // After simplification only gradient defs should be referenced
    for (const unusedEl of [...defs.children]) {
      if (!isGradient(unusedEl.tag)) {
        safeRemove(unusedEl);
      }
    }

    this.elements = null; // force elements to reload
  }

  private _addToDefs(defs: XEl, newEl: XEl): void {
    const newId = newEl.attrib.get('id');
    if (newId === undefined) return; // idless defs are useless
    let insertAt = 0;
    for (let i = 0; i < defs.children.length; i++) {
      if (newId < (defs.children[i]!.attrib.get('id') ?? '')) {
        insertAt = i;
        break;
      }
    }
    defs.insert(insertAt, newEl);
  }

  private _removeOrphanedGradients(): void {
    // only keep gradients directly referenced by shapes
    const usedGradientIds = new Set<string>();
    for (const [, shapes] of this._elements()) {
      for (const shape of shapes) {
        const fill = shapeStr(shape, 'fill');
        if (!fill.startsWith('url(')) continue;
        let el: XEl;
        try {
          el = this.resolveUrl(fill, '*');
        } catch {
          continue; // skip not found
        }
        if (!isGradient(el.tag)) continue;
        const id = el.attrib.get('id');
        if (id !== undefined) usedGradientIds.add(id);
      }
    }
    for (const grad of findAll(this.svgRoot, (e) => isGradient(e.tag))) {
      if (!usedGradientIds.has(grad.attrib.get('id') ?? '')) {
        safeRemove(grad);
      }
    }
    this.elements = null;
  }

  // ---- tidy passes ----

  evenoddToNonzeroWinding(): void {
    const elements = this._elements();
    elements.forEach(([el, shapes], idx) => {
      const shape = shapes[0]!;
      if (shapeStr(shape, 'fill_rule') === 'evenodd') {
        elements[idx] = [el, [removeOverlaps(shape, this.ops)]];
      }
    });
  }

  normalizeOpacityPass(): void {
    for (const [, shapes] of this._elements()) {
      for (const shape of shapes) {
        normalizeOpacity(shape);
      }
    }
  }

  absolutePass(): void {
    const elements = this._elements();
    elements.forEach(([el, shapes], idx) => {
      elements[idx] = [el, shapes.map((s) => absoluteShape(s))];
    });
  }

  roundFloats(ndigits: number): void {
    for (const [, shapes] of this._elements()) {
      for (const shape of shapes) {
        roundShapeFloats(shape, ndigits);
      }
    }
  }

  removeEmptySubpathsPass(): void {
    for (const [, shapes] of this._elements()) {
      for (const shape of shapes) {
        removeEmptySubpaths(shape, this.ops);
      }
    }
  }

  removeUnpaintedShapes(): void {
    this._updateEtree();

    const remove: XEl[] = [];
    for (const [el, shapes] of this._elements()) {
      if (!mightPaint(shapes[0]!, this.ops)) {
        remove.push(el);
      }
    }
    for (const el of remove) {
      safeRemove(el);
    }
    this.elements = null;
  }

  // ---- validation ----

  checkPicosvg(): string[] {
    this._updateEtree();

    const errors: string[] = [];
    const badPaths = new Set<string>();

    const pathAllowlist = [
      /^\/svg\[0\]$/,
      /^\/svg\[0\]\/defs\[0\]$/,
      /^\/svg\[0\]\/defs\[0\]\/(linear|radial)Gradient\[\d+\](\/stop\[\d+\])?$/,
      /^\/svg\[0\](\/(path|g)\[\d+\])+$/,
    ];
    const pathsRequired = new Set(['/svg[0]', '/svg[0]/defs[0]']);

    const ids = new Map<string, string>();
    for (const context of this.breadthFirst()) {
      if ([...badPaths].some((bp) => context.path.startsWith(bp))) {
        continue; // no sense reporting all the children as bad
      }

      if (!pathAllowlist.some((pat) => pat.test(context.path))) {
        errors.push(`BadElement: ${context.path}`);
        badPaths.add(context.path);
        continue;
      }

      pathsRequired.delete(context.path);

      const elId = context.element.attrib.get('id');
      if (elId !== undefined) {
        if (ids.has(elId)) {
          errors.push(
            `BadElement: ${context.path} reuses id="${elId}", first seen at ${ids.get(elId)}`
          );
        }
        ids.set(elId, context.path);
      }
    }

    for (const path of pathsRequired) {
      errors.push(`MissingElement: ${path}`);
    }

    return errors;
  }

  // ---- the big one ----

  topicosvg(ndigits = 3): void {
    this._updateEtree();

    // Discard useless content
    this.removeNonSvgContent();
    // (processing instructions and comments are dropped at parse time)
    this.removeAnonymousSymbols();
    this.removeTitleMetaDesc();

    // Simplify things that simplify in isolation
    this.applyStyleAttributes();
    this.rejectNestedSvgs();
    this.shapesToPaths();
    this.expandShorthand();
    this.resolveUse();

    // Simplify things that do not simplify in isolation
    this.simplify();

    // Tidy up
    this.evenoddToNonzeroWinding();
    this.normalizeOpacityPass();
    this.absolutePass();
    this.roundFloats(ndigits);

    // remove empty subpaths *after* rounding
    this.removeEmptySubpathsPass();
    this.removeUnpaintedShapes();

    const violations = this.checkPicosvg();
    if (violations.length) {
      throw new Error('Unable to convert to picosvg: ' + violations.join(','));
    }
  }

  toString(): string {
    this._updateEtree();
    return serializeSvg(this.svgRoot);
  }
}
