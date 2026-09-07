import type { SvgDocument } from './document';
import { collapse } from './stages/collapse';
import {
  removeAnonymousSymbols,
  removeNonSvgContent,
  removeTitleMetaDesc,
} from './stages/discard';
import { evenoddToNonzeroWinding } from './stages/fill-rule';
import { resolveNestedSvgs } from './stages/nested-svg';
import { normalizeOpacities } from './stages/opacity';
import {
  absoluteCoordinates,
  dropEmptySubpaths,
  expandShorthandCommands,
  removeUnpaintedShapes,
  roundFloats,
  shapesToPaths,
} from './stages/shapes';
import { applyStyleAttributes } from './stages/styles';
import { resolveUse } from './stages/use';
import { validateFlattened } from './stages/validate';

export function flattenDocument(doc: SvgDocument, ndigits = 3): void {
  doc.syncTree();

  // Discard useless content
  removeNonSvgContent(doc);
  // (processing instructions and comments are dropped at parse time)
  removeAnonymousSymbols(doc);
  removeTitleMetaDesc(doc);

  // Simplify things that simplify in isolation
  applyStyleAttributes(doc);
  resolveNestedSvgs(doc);
  shapesToPaths(doc);
  expandShorthandCommands(doc);
  resolveUse(doc);

  // Simplify things that do not simplify in isolation
  collapse(doc);

  // Tidy up
  evenoddToNonzeroWinding(doc);
  normalizeOpacities(doc);
  absoluteCoordinates(doc);
  roundFloats(doc, ndigits);

  // remove empty subpaths *after* rounding
  dropEmptySubpaths(doc);
  removeUnpaintedShapes(doc);

  const violations = validateFlattened(doc);
  if (violations.length) {
    throw new Error('Unable to flatten svg: ' + violations.join(','));
  }
}
