import { JSDOM } from 'jsdom';
import { parseColor } from '../../utils/parse';

export type ParsedFlatSvg = {
  viewBox: [number, number, number, number];
  paths: Array<{ d: string; fill: string | null }>;
};

// if the fill is implicit, walk ancestors for the first explicit fill value
function resolveInheritedFill(el: Element): string {
  let current: Element | null = el.parentElement;
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
  if (!trimmed || /^[Mm]/.test(trimmed)) {
    return { d: trimmed, sanitized: false };
  }

  // Strip trailing close commands, then grab the last two numbers as x,y
  const withoutClose = trimmed.replace(/[Zz]\s*$/, '');
  const nums = withoutClose.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) {
    return { d: trimmed, sanitized: false };
  }

  const x = nums[nums.length - 2];
  const y = nums[nums.length - 1];
  return { d: `M${x},${y} ${trimmed}`, sanitized: true };
}

export const parsePath = (p: Element): { d: string; fill: string | null } => {
  const d = p.getAttribute('d') ?? '';

  const op = p.getAttribute('opacity');
  const fillOp = p.getAttribute('fill-opacity');
  const fill = p.getAttribute('fill');

  if (op !== null || fillOp !== null) {
    const opVal = op !== null ? parseFloat(op) : 1;
    const fillOpVal = fillOp !== null ? parseFloat(fillOp) : 1;
    const combinedOpacity = opVal * fillOpVal;
    return {
      d,
      fill: calculateOpColor(fill, combinedOpacity, p),
    };
  }

  return {
    d,
    fill,
  };
};

export function parseFlattenedSvg(
  flattenedSvg: string,
  options?: { onSanitize?: (original: string) => void }
): ParsedFlatSvg {
  const dom = new JSDOM(flattenedSvg);
  const doc = dom.window.document;

  const svgEl = doc.querySelector('svg');
  const viewBoxRaw = svgEl
    ?.getAttribute('viewBox')
    ?.split(/\s+/)
    .map(Number) ?? [0, 0, 100, 100];

  const viewBox: [number, number, number, number] =
    viewBoxRaw.length === 4 && viewBoxRaw.every((n) => Number.isFinite(n))
      ? [viewBoxRaw[0]!, viewBoxRaw[1]!, viewBoxRaw[2]!, viewBoxRaw[3]!]
      : [0, 0, 100, 100];

  const pathEls = Array.from(doc.querySelectorAll('path'));

  const paths = pathEls
    .map(parsePath)
    .filter((p) => p.d.trim() !== '')
    .map((p) => {
      const { d, sanitized } = sanitizePathData(p.d);
      if (sanitized) {
        options?.onSanitize?.(p.d);
      }
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
  if (/<mask[\s>]/i.test(content)) {
    return { valid: false, reason: '<mask> is not supported yet' };
  }
  if (/<filter[\s>]/i.test(content)) {
    return { valid: false, reason: '<filter> is not supported yet' };
  }
  return { valid: true };
}

// ensure the svg has a xmlns attribute
export function preprocessSvg(content: string): string {
  if (/xmlns\s*=/.test(content)) return content;
  return content.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
}
