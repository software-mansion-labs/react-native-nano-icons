import { XEl, findAll, replaceEl, svgTag, xlinkHrefAttr } from '../dom';
import type { SvgDocument } from '../document';
import { isTag, numberAttrib, tryRemoveGroup } from '../element';
import { inheritAttrib } from '../inherit';
import { Affine2D } from '../transform';

export function expandUses(doc: SvgDocument, scopeEl: XEl): void {
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
  for (const el of findAll(doc.root, (e) => e.attrib.has('id'))) {
    elById.set(el.attrib.get('id')!, el);
  }

  for (;;) {
    const useEls = findAll(scopeEl, (e) => isTag(e, 'use'));
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
        numberAttrib(useEl, 'x', 0),
        numberAttrib(useEl, 'y', 0)
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

export function resolveUse(doc: SvgDocument): void {
  doc.syncTree();
  expandUses(doc, doc.root);
}
