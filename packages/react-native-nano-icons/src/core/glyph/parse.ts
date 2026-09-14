import { DOMParser, type Element } from '@xmldom/xmldom';
import { parseColor } from '../../utils/parse';
import {
  SVG_MOVE_PREFIX,
  SVG_NUMBER,
  SVG_TRAILING_CLOSE,
  WHITESPACE,
} from '../../utils/svgPatterns';

export type ParsedPath = {
  d: string;
  fill: string | null;
  fillRule?: 'evenodd';
  noMerge?: boolean;
};

export type ParsedFlatSvg = {
  viewBox: [number, number, number, number];
  paths: ParsedPath[];
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
 * If a flattened path lost its initial moveto (e.g. an empty `Mx y z`
 * subpath was dropped), prepend `M` using the path's last coordinate pair.
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

const parsePath = (p: Element): ParsedPath => {
  const d = p.getAttribute('d') ?? '';

  const op = p.getAttribute('opacity');
  const fillOp = p.getAttribute('fill-opacity');
  const fill = p.getAttribute('fill');
  // flattening may drop fill-rule but preserve clip-rule; treat either as evenodd
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
  options?: {
    onSanitize?: (original: string) => void;
    onMissingViewBox?: (assumed: [number, number, number, number]) => void;
  }
): ParsedFlatSvg {
  const doc = new DOMParser().parseFromString(flattenedSvg, 'image/svg+xml');
  const svgEl = doc.documentElement;

  const viewBoxRaw = svgEl
    ?.getAttribute('viewBox')
    ?.split(WHITESPACE)
    .map(Number);

  let viewBox: [number, number, number, number];
  if (viewBoxRaw?.length === 4 && viewBoxRaw.every(Number.isFinite)) {
    viewBox = [viewBoxRaw[0]!, viewBoxRaw[1]!, viewBoxRaw[2]!, viewBoxRaw[3]!];
  } else {
    const width = parseFloat(svgEl?.getAttribute('width') ?? '');
    const height = parseFloat(svgEl?.getAttribute('height') ?? '');
    viewBox =
      width > 0 && height > 0 ? [0, 0, width, height] : [0, 0, 100, 100];
    options?.onMissingViewBox?.(viewBox);
  }

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
