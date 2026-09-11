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
/** `<image …>` element (unsupported). */
export const XML_IMAGE = /<image[\s>]/i;
/** An `xmlns=` attribute. */
export const XML_XMLNS = /xmlns\s*=/;
/** Opening `<svg` tag. */
export const SVG_OPEN_TAG = /<svg\b/;
export const PX_ATTRIBUTE_VALUE = /=(["'])(\s*-?(?:\d+\.?\d*|\.\d+))px\s*\1/g;
export const PX_STYLE_VALUE =
  /(:\s*-?(?:\d+\.?\d*|\.\d+))px(?=\s*(?:;|["']|$))/g;

// --- SVG attribute value separators ---
/** viewBox: comma or whitespace separated. */
export const VIEWBOX_SEPARATOR = /,|\s+/;
/** transform() arguments: comma and/or whitespace separated. */
export const TRANSFORM_ARG_SEPARATOR = /\s*[,\s]\s*/;
/** stroke-dasharray: single comma or space separated. */
export const DASHARRAY_SEPARATOR = /[, ]/;
/** One transform function call, e.g. `rotate(30)`; captures name and args. */
export const TRANSFORM_FUNCTION =
  /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
/** `url(#id)` reference; captures the id. */
export const URL_ID_REFERENCE = /^url[(]#([\w-]+)[)]$/;
/** A well-formed XML attribute name. */
export const XML_ATTRIBUTE_NAME = /^[A-Za-z_][\w.-]*$/;

// --- XML escaping / font emit ---
export const XML_AMP = /&/g;
export const XML_LT = /</g;
export const XML_GT = />/g;
export const XML_QUOT = /"/g;
/** svg2ttf error `glyph "u<hex>"` → captures the hex codepoint. */
export const GLYPH_CODEPOINT = /glyph\s+"u([0-9a-fA-F]+)"/;
