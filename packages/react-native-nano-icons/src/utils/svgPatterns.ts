// Regexes for parsing/validating SVG path data and XML markup.

// --- SVG path data ---
/** Path already starts with a moveto. */
export const SVG_MOVE_PREFIX = /^[Mm]/;
/** Trailing close-path command (+ optional whitespace). */
export const SVG_TRAILING_CLOSE = /[Zz]\s*$/;
/** A signed int/float token. */
export const SVG_NUMBER = /-?\d+(?:\.\d+)?/g;
/** Whitespace separator (e.g. viewBox parts). */
export const WHITESPACE = /\s+/;

// --- SVG/XML validation ---
/** `<mask …>` element (unsupported). */
export const XML_MASK = /<mask[\s>]/i;
/** `<filter …>` element (unsupported). */
export const XML_FILTER = /<filter[\s>]/i;
/** A `fill-rule="evenodd"` attribute. */
export const XML_EVENODD = /<[^>]*fill-rule\s*=\s*["']evenodd/i;
/** An `xmlns=` attribute. */
export const XML_XMLNS = /xmlns\s*=/;
/** Opening `<svg` tag. */
export const SVG_OPEN_TAG = /<svg\b/;

// --- XML escaping / font emit ---
export const XML_AMP = /&/g;
export const XML_QUOT = /"/g;
/** svg2ttf error `glyph "u<hex>"` → captures the hex codepoint. */
export const GLYPH_CODEPOINT = /glyph\s+"u([0-9a-fA-F]+)"/;
