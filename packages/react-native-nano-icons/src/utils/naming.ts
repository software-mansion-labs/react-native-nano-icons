// Shared regexes + helpers for sanitizing asset/symbol names into valid
// Android resource ids and TypeScript manifest identifiers.

/** Chars illegal in an Android drawable resource name → `_`. */
const NON_RESOURCE_CHARS = /[^a-z0-9_]+/g;
/** Leading/trailing underscores to trim. */
const EDGE_UNDERSCORES = /^_+|_+$/g;
/** Resource names must start with a lowercase letter. */
const STARTS_WITH_LOWER = /^[a-z]/;
/** Word separators in a set name (split → PascalCase parts). */
const NAME_SEPARATORS = /[^a-zA-Z0-9]+/;
/** Manifest identifiers must start with a letter. */
const STARTS_WITH_LETTER = /^[a-zA-Z]/;

/** Prefix used when a sanitized name would be empty or start with a non-letter. */
const RESOURCE_FALLBACK_PREFIX = 'nano_';

/**
 * Resource names must match `[a-z][a-z0-9_]*` — no dots/uppercase.
 * `nano.home` → `nano_home`, `nano.person-walking` → `nano_person_walking`.
 */
export function toDrawableResourceName(assetName: string): string {
  let name = assetName.toLowerCase().replace(NON_RESOURCE_CHARS, '_');
  name = name.replace(EDGE_UNDERSCORES, '');
  if (name === '' || !STARTS_WITH_LOWER.test(name)) {
    name = `${RESOURCE_FALLBACK_PREFIX}${name}`;
  }
  return name;
}

/** "my-tab icons" → "MyTabIcons" — PascalCase base for manifest identifiers. */
export function manifestBaseName(setName: string): string {
  const pascal = setName
    .split(NAME_SEPARATORS)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('');
  return STARTS_WITH_LETTER.test(pascal) ? pascal : `Set${pascal}`;
}

/** Manifest export name, e.g. `MyTabIconsSymbols` / `MyTabIconsDrawables`. */
export function manifestExportName(
  setName: string,
  suffix = 'Symbols'
): string {
  return `${manifestBaseName(setName)}${suffix}`;
}
