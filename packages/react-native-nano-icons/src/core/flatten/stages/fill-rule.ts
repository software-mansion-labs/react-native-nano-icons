import type { SvgDocument } from '../document';
import { removeOverlaps, shapeStr } from '../shape';

export function evenoddToNonzeroWinding(doc: SvgDocument): void {
  doc.mapShapes((s) =>
    shapeStr(s, 'fill_rule') === 'evenodd' ? removeOverlaps(s, doc.ops) : s
  );
}
