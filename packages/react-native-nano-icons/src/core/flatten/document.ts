import type { Rect } from './geometry';
import {
  XEl,
  findAll,
  parseSvgDocument,
  replaceEl,
  serializeSvg,
  stripNs,
} from './dom';
import { INHERITABLE_ATTRIB_DEFAULTS, attribToPassOn } from './inherit';
import type { PathOps } from './pathops';
import type { Shape } from './shape';
import { fromElement, isShapeTag, toElement } from './shape';
import { Affine2D } from './transform';
import { elementTransform, idOfTarget, parseViewBox } from './element';
import { resolveClipPath } from './stages/clip-path';

// How much error, as pct of viewbox max(w,h), is allowed on lossy ops
const MAX_PCT_ERROR = 0.1;
// When you have no viewbox, use this. Absolute value in svg units.
const DEFAULT_DEFAULT_TOLERANCE = 0.1;

export type TraverseContext = {
  nthOfType: number;
  element: XEl;
  path: string;
  transform: Affine2D;
  clips: Shape[];
  attrib: Record<string, string>; // except clip-path/opacity/transform
};

export type ShapeEntry = [XEl, Shape[]];

export class SvgDocument {
  readonly root: XEl;
  readonly ops: PathOps;
  private shapeCache: ShapeEntry[] | null = null;

  constructor(root: XEl, ops: PathOps) {
    this.root = root;
    this.ops = ops;
  }

  static parse(content: string, ops: PathOps): SvgDocument {
    return new SvgDocument(parseSvgDocument(content), ops);
  }

  // ---- shape/element cache sync ----

  hasShapes(): boolean {
    return this.shapeCache !== null;
  }

  shapeEntries(): ShapeEntry[] {
    if (this.shapeCache) {
      return this.shapeCache;
    }
    const entries: ShapeEntry[] = [];
    for (const context of this.depthFirst(false)) {
      const el = context.element;
      if (!isShapeTag(el.tag)) continue;
      entries.push([el, [fromElement(el, context.attrib)]]);
    }
    this.shapeCache = entries;
    return this.shapeCache;
  }

  invalidateShapes(): void {
    this.shapeCache = null;
  }

  mapShapes(fn: (shape: Shape) => Shape): void {
    const entries = this.shapeEntries();
    entries.forEach(([el, shapes], idx) => {
      entries[idx] = [el, shapes.map(fn)];
    });
  }

  forEachShape(fn: (shape: Shape) => void): void {
    for (const [, shapes] of this.shapeEntries()) {
      for (const shape of shapes) {
        fn(shape);
      }
    }
  }

  private inheritedAttrib(el: XEl): Record<string, string> {
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

  syncTree(): void {
    if (!this.shapeCache) return;
    for (const [oldEl, shapes] of this.shapeCache) {
      const inherited = this.inheritedAttrib(oldEl);
      replaceEl(
        oldEl,
        shapes.map((s) => toElement(s, inherited))
      );
    }
    this.shapeCache = null;
  }

  // ---- geometry context ----

  viewBox(): Rect | null {
    const raw = this.root.attrib.get('viewBox');
    if (raw === undefined) {
      const w = this.root.attrib.get('width');
      const h = this.root.attrib.get('height');
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

  // ---- lookups ----

  resolveUrl(url: string, elTag: string): XEl {
    const id = idOfTarget(url);
    const matches = findAll(
      this.root,
      (el) =>
        el.attrib.get('id') === id &&
        (elTag === '*' || stripNs(el.tag) === elTag)
    );
    if (matches.length !== 1) {
      const what = elTag === '*' ? 'element' : `<${elTag}>`;
      throw new Error(
        matches.length === 0
          ? `${url} references ${what} with id "${id}", but no such element exists`
          : `${url} matches ${matches.length} ${what} elements with id "${id}", expected exactly one`
      );
    }
    return matches[0]!;
  }

  // ---- traversal ----

  private *traverse(
    nextFn: (frontier: TraverseContext[]) => TraverseContext,
    appendFn: (frontier: TraverseContext[], entries: TraverseContext[]) => void,
    resolveClipPaths: boolean
  ): Generator<TraverseContext, void, void> {
    const frontier: TraverseContext[] = [
      {
        nthOfType: 0,
        element: this.root,
        path: '/svg[0]',
        transform: Affine2D.identity(),
        clips: [],
        attrib: attribToPassOn({ ...INHERITABLE_ATTRIB_DEFAULTS }, this.root),
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
          clips = [...clips, resolveClipPath(this, clipPathAttr, transform)];
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
    return this.traverse(
      (f) => f.pop()!,
      (f, e) => f.push(...e.reverse()),
      resolveClipPaths
    );
  }

  breadthFirst(
    resolveClipPaths = true
  ): Generator<TraverseContext, void, void> {
    return this.traverse(
      (f) => f.shift()!,
      (f, e) => f.push(...e),
      resolveClipPaths
    );
  }

  serialize(): string {
    this.syncTree();
    return serializeSvg(this.root);
  }
}
