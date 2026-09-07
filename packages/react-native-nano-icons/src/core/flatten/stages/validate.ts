import type { SvgDocument } from '../document';

const PATH_ALLOWLIST = [
  /^\/svg\[0\]$/,
  /^\/svg\[0\]\/defs\[0\]$/,
  /^\/svg\[0\]\/defs\[0\]\/(linear|radial)Gradient\[\d+\](\/stop\[\d+\])?$/,
  /^\/svg\[0\](\/(path|g)\[\d+\])+$/,
];

export function validateFlattened(doc: SvgDocument): string[] {
  doc.syncTree();

  const errors: string[] = [];
  const badPaths = new Set<string>();
  const pathsRequired = new Set(['/svg[0]', '/svg[0]/defs[0]']);

  const ids = new Map<string, string>();
  for (const context of doc.breadthFirst()) {
    if ([...badPaths].some((bp) => context.path.startsWith(bp))) {
      continue; // no sense reporting all the children as bad
    }

    if (!PATH_ALLOWLIST.some((pat) => pat.test(context.path))) {
      errors.push(`BadElement: ${context.path}`);
      badPaths.add(context.path);
      continue;
    }

    pathsRequired.delete(context.path);

    const elId = context.element.attrib.get('id');
    if (elId !== undefined) {
      if (ids.has(elId)) {
        errors.push(
          `BadElement: ${context.path} reuses id="${elId}", first seen at ${ids.get(elId)}`
        );
      }
      ids.set(elId, context.path);
    }
  }

  for (const path of pathsRequired) {
    errors.push(`MissingElement: ${path}`);
  }

  return errors;
}
