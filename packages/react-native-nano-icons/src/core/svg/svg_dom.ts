import { DOMParser, type Element } from '@xmldom/xmldom';
import { parseColor } from '../../utils/parse';
import {
  SVG_MOVE_PREFIX,
  SVG_TRAILING_CLOSE,
  SVG_NUMBER,
  WHITESPACE,
  XML_MASK,
  XML_FILTER,
  XML_EVENODD,
  XML_XMLNS,
  SVG_OPEN_TAG,
} from '../../utils/svgPatterns';

export type ParsedFlatSvg = {
  viewBox: [number, number, number, number];
  paths: Array<{ d: string; fill: string | null; fillRule?: 'evenodd' }>;
};

// if the fill is implicit, walk ancestors for the first explicit fill value
function resolveInheritedFill(el: Element): string {
  let current = el.parentElement;
  while (current !== null) {
    const fill = current.getAttribute('fill');
    if (fill !== null && fill !== 'inherit') return fill;
    current = current.parentElement;
  }
  return 'black';
}

// bake opacity into the fill as an rgba(...)
export function calculateOpColor(
  fill: string | null,
  opacity: number,
  el: Element
): `rgba(${number},${number},${number},${number})` {
  const resolvedFill = fill ?? resolveInheritedFill(el);
  const [r, g, b, a] = parseColor(resolvedFill);
  const finalAlpha = +(a * opacity).toFixed(4);
  return `rgba(${r},${g},${b},${finalAlpha})`;
}

/**
 * If a flattened path lost its initial moveto (e.g. picosvg dropped an empty
 * `Mx y z` subpath), prepend `M` using the path's last coordinate pair.
 * For closed icon shapes the endpoint equals the start point.
 */
export function sanitizePathData(d: string): { d: string; sanitized: boolean } {
  const trimmed = d.trim();
  if (!trimmed || SVG_MOVE_PREFIX.test(trimmed)) {
    return { d: trimmed, sanitized: false };
  }

  // Strip trailing close commands, then grab the last two numbers as x,y
  const withoutClose = trimmed.replace(SVG_TRAILING_CLOSE, '');
  const nums = withoutClose.match(SVG_NUMBER);
  if (!nums || nums.length < 2) {
    return { d: trimmed, sanitized: false };
  }

  const x = nums[nums.length - 2];
  const y = nums[nums.length - 1];
  return { d: `M${x},${y} ${trimmed}`, sanitized: true };
}

export const parsePath = (
  p: Element
): { d: string; fill: string | null; fillRule?: 'evenodd' } => {
  const d = p.getAttribute('d') ?? '';

  const op = p.getAttribute('opacity');
  const fillOp = p.getAttribute('fill-opacity');
  const fill = p.getAttribute('fill');
  // picosvg may drop fill-rule but preserve clip-rule; treat either as evenodd
  const fillRule =
    p.getAttribute('fill-rule') === 'evenodd' ||
    p.getAttribute('clip-rule') === 'evenodd'
      ? ('evenodd' as const)
      : undefined;

  if (op !== null || fillOp !== null) {
    const opVal = op !== null ? parseFloat(op) : 1;
    const fillOpVal = fillOp !== null ? parseFloat(fillOp) : 1;
    const combinedOpacity = opVal * fillOpVal;
    return {
      d,
      fill: calculateOpColor(fill, combinedOpacity, p),
      fillRule,
    };
  }

  return {
    d,
    fill,
    fillRule,
  };
};

export function parseFlattenedSvg(
  flattenedSvg: string,
  options?: { onSanitize?: (original: string) => void }
): ParsedFlatSvg {
  const doc = new DOMParser().parseFromString(flattenedSvg, 'image/svg+xml');
  const svgEl = doc.documentElement;

  const viewBoxRaw = svgEl
    ?.getAttribute('viewBox')
    ?.split(WHITESPACE)
    .map(Number) ?? [0, 0, 100, 100];

  const viewBox: [number, number, number, number] =
    viewBoxRaw.length === 4 && viewBoxRaw.every(Number.isFinite)
      ? [viewBoxRaw[0]!, viewBoxRaw[1]!, viewBoxRaw[2]!, viewBoxRaw[3]!]
      : [0, 0, 100, 100];

  const pathEls = svgEl ? Array.from(svgEl.getElementsByTagName('path')) : [];

  const paths = pathEls
    .map(parsePath)
    .filter((p) => p.d.trim() !== '')
    .map((p) => {
      const { d, sanitized } = sanitizePathData(p.d);
      if (sanitized) options?.onSanitize?.(p.d);
      return { ...p, d };
    });

  return { viewBox, paths };
}

export function shouldSkipPath(d: string, fill: string | null): boolean {
  if (!d || d.trim() === '') return true;
  const f = (fill ?? '').trim().toLowerCase();
  return f === 'transparent' || f === 'none';
}

export type SvgValidation = { valid: true } | { valid: false; reason: string };

export function validateSvg(content: string): SvgValidation {
  if (XML_MASK.test(content)) {
    return { valid: false, reason: '<mask> is not supported yet' };
  }
  if (XML_FILTER.test(content)) {
    return { valid: false, reason: '<filter> is not supported yet' };
  }
  if (/<image[\s>]/i.test(content)) {
    return {
      valid: false,
      reason: 'embedded raster <image> is not supported yet',
    };
  }
  return { valid: true };
}

/**
 * Extract the original `d` strings of evenodd paths from the raw SVG
 * BEFORE picosvg processes it. Picosvg's simplify (via our PathKit shim)
 * can drop contours from multi-subpath evenodd paths, so we preserve
 * the originals and apply our own winding conversion later.
 *
 * Returns one `d` string per evenodd path, in document order.
 */
export function extractOriginalEvenoddDs(svgContent: string): string[] {
  if (!XML_EVENODD.test(svgContent)) {
    return [];
  }

  const doc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');

  return Array.from(doc.getElementsByTagName('path')).reduce<string[]>(
    (acc, el) => {
      const isEvenOdd =
        el.getAttribute('fill-rule') === 'evenodd' ||
        el.getAttribute('clip-rule') === 'evenodd';
      if (!isEvenOdd) return acc;
      const d = el.getAttribute('d');
      if (d !== null && d !== '') acc.push(d);
      return acc;
    },
    []
  );
}

/**
 * Replace picosvg's (potentially damaged) evenodd path data with the
 * preserved originals. Matches by position: the Nth evenodd path in
 * the parsed output gets the Nth original `d` string.
 */
export function restoreOriginalEvenoddDs(
  paths: ParsedFlatSvg['paths'],
  originalDs: string[]
): void {
  let oi = 0;
  for (const p of paths) {
    if (p.fillRule === 'evenodd' && oi < originalDs.length) {
      p.d = originalDs[oi]!;
      oi++;
    }
  }
}

// ensure the svg has a xmlns attribute
export function preprocessSvg(content: string): string {
  if (XML_XMLNS.test(content)) return content;
  return content.replace(
    SVG_OPEN_TAG,
    '<svg xmlns="http://www.w3.org/2000/svg"'
  );
}
