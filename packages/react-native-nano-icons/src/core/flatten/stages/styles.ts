import { XEl, findAll } from '../dom';
import type { SvgDocument } from '../document';
import { applyStyleAttribute, parseCssDeclarations } from '../shape';
import { XML_ATTRIBUTE_NAME } from '../../../utils/svgPatterns';

function applyStyles(el: XEl): void {
  const style = el.attrib.get('style') ?? '';
  el.attrib.delete('style');
  const parsed: Record<string, string> = {};
  parseCssDeclarations(style, parsed); // unparsed remnants are dropped here
  for (const [name, value] of Object.entries(parsed)) {
    // invalid attribute names (e.g. -inkscape-*) are dropped
    if (XML_ATTRIBUTE_NAME.test(name)) {
      el.attrib.set(name, value);
    }
  }
}

export function applyStyleAttributes(doc: SvgDocument): void {
  if (doc.hasShapes()) {
    // if we already parsed shapes, apply style attrs and sync tree
    doc.mapShapes((s) => applyStyleAttribute(s));
    doc.syncTree();
  }

  const styled = [doc.root, ...findAll(doc.root, (e) => e.attrib.has('style'))];
  for (const el of styled) {
    applyStyles(el);
  }
}
