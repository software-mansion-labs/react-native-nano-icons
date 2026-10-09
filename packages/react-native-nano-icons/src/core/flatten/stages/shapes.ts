import { XEl } from '../dom';
import type { SvgDocument } from '../document';
import {
  absoluteShape,
  asPath,
  explicitLinesExpandShorthand,
  mightPaint,
  removeEmptySubpaths,
  roundShapeFloats,
} from '../shape';

export function shapesToPaths(doc: SvgDocument): void {
  doc.mapShapes((s) => asPath(s));
}

export function expandShorthandCommands(doc: SvgDocument): void {
  doc.mapShapes((s) =>
    s.tag === 'path' ? explicitLinesExpandShorthand(s) : s
  );
}

export function absoluteCoordinates(doc: SvgDocument): void {
  doc.mapShapes((s) => absoluteShape(s));
}

export function roundFloats(doc: SvgDocument, ndigits: number): void {
  doc.forEachShape((s) => roundShapeFloats(s, ndigits));
}

export function dropEmptySubpaths(doc: SvgDocument): void {
  doc.forEachShape((s) => removeEmptySubpaths(s, doc.ops));
}

export function removeUnpaintedShapes(doc: SvgDocument): void {
  doc.syncTree();

  const remove: XEl[] = [];
  for (const [el, shapes] of doc.shapeEntries()) {
    if (!mightPaint(shapes[0]!, doc.ops)) {
      remove.push(el);
    }
  }
  for (const el of remove) {
    el.detach();
  }
  doc.invalidateShapes();
}
