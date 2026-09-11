import type { SvgDocument } from '../document';
import { normalizeOpacity } from '../shape';

export function normalizeOpacities(doc: SvgDocument): void {
  doc.forEachShape((s) => normalizeOpacity(s));
}
