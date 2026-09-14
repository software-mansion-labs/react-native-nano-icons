import { XEl, findAll } from '../dom';
import type { SvgDocument } from '../document';
import { isGradient } from '../element';
import { shapeStr } from '../shape';

export function addToDefs(defs: XEl, newEl: XEl): void {
  const newId = newEl.attrib.get('id');
  if (newId === undefined) return; // idless defs are useless
  let insertAt = defs.children.length;
  for (let i = 0; i < defs.children.length; i++) {
    if (newId < (defs.children[i]!.attrib.get('id') ?? '')) {
      insertAt = i;
      break;
    }
  }
  defs.insert(insertAt, newEl);
}

export function removeOrphanedGradients(doc: SvgDocument): void {
  // only keep gradients directly referenced by shapes
  const usedGradientIds = new Set<string>();
  for (const [, shapes] of doc.shapeEntries()) {
    for (const shape of shapes) {
      const fill = shapeStr(shape, 'fill');
      if (!fill.startsWith('url(')) continue;
      let el: XEl;
      try {
        el = doc.resolveUrl(fill, '*');
      } catch {
        continue; // skip not found
      }
      if (!isGradient(el.tag)) continue;
      const id = el.attrib.get('id');
      if (id !== undefined) usedGradientIds.add(id);
    }
  }
  for (const grad of findAll(doc.root, (e) => isGradient(e.tag))) {
    if (!usedGradientIds.has(grad.attrib.get('id') ?? '')) {
      grad.detach();
    }
  }
  doc.invalidateShapes();
}
