import { DOMParser, XMLSerializer, type Element } from '@xmldom/xmldom';

export const KNOCKOUT_ATTRIBUTE = 'data-nano-knockout';
export const KNOCKOUT_MARKER_FILL = '#fe01fe';

const ELEMENT_NODE = 1;
const PAINT_PROPERTIES = ['fill', 'stroke'] as const;

type PaintProperty = (typeof PAINT_PROPERTIES)[number];

function styleDeclaration(property: PaintProperty): RegExp {
  return new RegExp(`(^|;)\\s*${property}\\s*:([^;]*)`);
}

function explicitPaint(el: Element, property: PaintProperty): string | null {
  const fromStyle = el.getAttribute('style')?.match(styleDeclaration(property));
  if (fromStyle) return fromStyle[2]!.trim();
  return el.getAttribute(property);
}

function setPaint(el: Element, property: PaintProperty, value: string): void {
  const style = el.getAttribute('style');
  if (style !== null) {
    el.setAttribute('style', style.replace(styleDeclaration(property), '$1'));
  }
  el.setAttribute(property, value);
}

function markElement(el: Element, isAnnotatedRoot: boolean): void {
  for (const property of PAINT_PROPERTIES) {
    const paint = explicitPaint(el, property);
    if (paint !== null && paint !== 'none') {
      setPaint(el, property, KNOCKOUT_MARKER_FILL);
    } else if (paint === null && isAnnotatedRoot && property === 'fill') {
      setPaint(el, property, KNOCKOUT_MARKER_FILL);
    }
  }
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === ELEMENT_NODE) markElement(child as Element, false);
  }
}

export function markKnockoutFills(svg: string): string | null {
  if (!svg.includes(KNOCKOUT_ATTRIBUTE)) return null;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const annotated = Array.from(doc.getElementsByTagName('*')).filter((el) =>
    el.hasAttribute(KNOCKOUT_ATTRIBUTE)
  );
  if (annotated.length === 0) return null;
  for (const el of annotated) markElement(el, true);
  return new XMLSerializer().serializeToString(doc);
}
