import {
  SVG_NS,
  XEl,
  XLINK_NS,
  delAttrs,
  findAll,
  splitNs,
  stripNs,
} from '../dom';
import type { SvgDocument } from '../document';

function removeForeignAttrs(el: XEl, goodNs: ReadonlySet<string | null>): void {
  const attrToRm: string[] = [];
  for (const attr of el.attrib.keys()) {
    if (!goodNs.has(splitNs(attr)[0])) {
      attrToRm.push(attr);
    }
  }
  delAttrs(el, ...attrToRm);
}

export function removeNonSvgContent(doc: SvgDocument): void {
  doc.syncTree();

  const goodNs = new Set<string | null>([SVG_NS, XLINK_NS]);
  if (splitNs(doc.root.tag)[0] === SVG_NS) {
    goodNs.add(null);
  }

  const elToRm: XEl[] = [];
  for (const el of doc.root.iter()) {
    if (el === doc.root) continue;
    if (!goodNs.has(splitNs(el.tag)[0])) {
      elToRm.push(el);
      continue;
    }
    removeForeignAttrs(el, goodNs);
  }
  removeForeignAttrs(doc.root, goodNs);

  for (const el of elToRm) {
    el.detach();
  }

  doc.invalidateShapes();
}

export function removeAnonymousSymbols(doc: SvgDocument): void {
  doc.syncTree();
  for (const el of findAll(
    doc.root,
    (e) => stripNs(e.tag) === 'symbol' && !e.attrib.has('id')
  )) {
    el.detach();
  }
}

export function removeTitleMetaDesc(doc: SvgDocument): void {
  doc.syncTree();
  const tags = new Set(['title', 'desc', 'metadata', 'comment']);
  for (const el of findAll(doc.root, (e) => tags.has(stripNs(e.tag)))) {
    el.detach();
  }
}
