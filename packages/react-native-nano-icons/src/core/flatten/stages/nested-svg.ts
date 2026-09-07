import type { Rect } from '../geometry';
import { ntos } from '../geometry';
import { XEl, findAll, replaceEl, svgTag } from '../dom';
import type { SvgDocument } from '../document';
import { isTag, parseViewBox } from '../element';
import { fromElement, toElement } from '../shape';
import { Affine2D } from '../transform';

function rectEquals(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

type NestedSvgAttrs = {
  x?: string | null;
  y?: string | null;
  width?: string | null;
  height?: string | null;
  viewBox?: string | null;
  transform?: string | null;
  preserveAspectRatio?: string | null;
};

// viewport/viewBox mapping a nested <svg> imposes on its children, plus the
// viewBox its children resolve against
function nestedSvgTransform(
  attrs: NestedSvgAttrs,
  parentWidth: number,
  parentHeight: number
): { transform: Affine2D; viewport: Rect; viewBox: Rect } {
  const num = (raw: string | null | undefined, fallback: number): number => {
    if (raw === null || raw === undefined || !raw.trim()) return fallback;
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  const x = num(attrs.x, 0);
  const y = num(attrs.y, 0);
  const viewport: Rect = {
    x,
    y,
    w: num(attrs.width, parentWidth),
    h: num(attrs.height, parentHeight),
  };
  const viewBox =
    attrs.viewBox === null || attrs.viewBox === undefined
      ? viewport
      : parseViewBox(attrs.viewBox);

  let transform = rectEquals(viewport, viewBox)
    ? Affine2D.identity().translate(x, y)
    : Affine2D.rectToRect(
        viewBox,
        viewport,
        attrs.preserveAspectRatio ?? 'xMidYMid'
      );

  if (attrs.transform !== null && attrs.transform !== undefined) {
    transform = Affine2D.composeLtr([
      transform,
      Affine2D.fromString(attrs.transform),
    ]);
  }

  return { transform, viewport, viewBox };
}

function viewportRect(
  x: number,
  y: number,
  width: number,
  height: number
): XEl {
  const el = new XEl(svgTag('rect'), [
    ['x', ntos(x)],
    ['y', ntos(y)],
    ['width', ntos(width)],
    ['height', ntos(height)],
  ]);
  return toElement(fromElement(el));
}

function newId(doc: SvgDocument, template: (i: number) => string): string {
  for (let i = 0; i < 1 << 16; i++) {
    const candidate = template(i);
    if (!findAll(doc.root, (el) => el.attrib.get('id') === candidate).length) {
      return candidate;
    }
  }
  throw new Error('No free id for nested svg viewport');
}

// immediate nested <svg> descendants, without descending into them
function nestedSvgs(root: XEl): XEl[] {
  const found: XEl[] = [];
  const frontier: XEl[] = [...root.children];
  while (frontier.length) {
    const el = frontier.shift()!;
    if (isTag(el, 'svg')) {
      found.push(el);
    } else if (el.children.length) {
      frontier.push(...el.children);
    }
  }
  return found;
}

function unnestSvg(
  doc: SvgDocument,
  svg: XEl,
  parentWidth: number,
  parentHeight: number
): XEl[] {
  const { transform, viewport, viewBox } = nestedSvgTransform(
    {
      x: svg.attrib.get('x') ?? null,
      y: svg.attrib.get('y') ?? null,
      width: svg.attrib.get('width') ?? null,
      height: svg.attrib.get('height') ?? null,
      viewBox: svg.attrib.get('viewBox') ?? null,
      transform: svg.attrib.get('transform') ?? null,
      preserveAspectRatio: svg.attrib.get('preserveAspectRatio') ?? null,
    },
    parentWidth,
    parentHeight
  );
  const { x, y, w: width, h: height } = viewport;

  // un-nest any nested nested svgs first
  for (const inner of nestedSvgs(svg)) {
    replaceEl(inner, unnestSvg(doc, inner, viewBox.w, viewBox.h));
  }

  const g = new XEl(svgTag('g'));
  for (const child of [...svg.children]) {
    g.append(child);
  }

  if (!transform.equals(Affine2D.identity())) {
    g.attrib.set('transform', transform.toString());
  }

  // non-root <svg> defaults to overflow="hidden", i.e. clipped to its viewport
  // https://www.w3.org/TR/SVG/render.html#OverflowAndClipProperties
  const overflow = svg.attrib.get('overflow') ?? 'hidden';
  if (overflow === 'visible') {
    return [g];
  }
  if (overflow !== 'hidden') {
    throw new Error(`overflow='${overflow}' is not supported`);
  }

  const clipId = newId(doc, (i) => `nested-svg-viewport-${i}`);
  const clipPath = new XEl(svgTag('clipPath'), [['id', clipId]]);
  clipPath.append(viewportRect(x, y, width, height));
  const clippedG = new XEl(svgTag('g'), [['clip-path', `url(#${clipId})`]]);
  clippedG.append(g);
  return [clipPath, clippedG];
}

export function resolveNestedSvgs(doc: SvgDocument): void {
  doc.syncTree();

  const nested = nestedSvgs(doc.root);
  if (!nested.length) {
    return;
  }

  const vbox = doc.viewBox();
  if (vbox === null) {
    throw new Error(
      "Can't determine root SVG width/height, which is required for " +
        'resolving nested SVGs'
    );
  }

  // swap one at a time so each generated clip-path id is already in the
  // tree before the next id is picked
  for (const el of nested) {
    replaceEl(el, unnestSvg(doc, el, vbox.w, vbox.h));
  }

  doc.invalidateShapes();
}
