import type { Rect } from './geometry';
import { ntos } from './geometry';
import { XEl, replaceEl, stripNs } from './dom';
import { dropDefaultAttrib, inheritAttrib } from './inherit';
import { Affine2D } from './transform';
import { URL_ID_REFERENCE, VIEWBOX_SEPARATOR } from '../../utils/svgPatterns';

const GRADIENT_TAGS = new Set(['linearGradient', 'radialGradient']);

export function numberAttrib(el: XEl, name: string, fallback: number): number {
  return parseFloat(el.attrib.get(name) ?? String(fallback));
}

export function isTag(el: XEl, local: string): boolean {
  return stripNs(el.tag) === local;
}

export function isDefs(tag: string): boolean {
  return stripNs(tag) === 'defs';
}

export function isGradient(tag: string): boolean {
  return GRADIENT_TAGS.has(stripNs(tag));
}

export function isGroup(tag: string): boolean {
  return stripNs(tag) === 'g';
}

function clamp(value: number, minv = 0.0, maxv = 1.0): number {
  return Math.max(Math.min(value, maxv), minv);
}

function elOpacity(el: XEl): number {
  return clamp(numberAttrib(el, 'opacity', 1));
}

// Groups with 0 < opacity < 1 and >1 child must be retained.
// This over-retains groups; no difference unless children overlap.
function isRemovableGroup(el: XEl): boolean {
  if (!isGroup(el.tag)) return false;
  // no attributes makes a group meaningless
  if (el.attrib.size === 0) return true;
  const numChildren = el.children.length;
  const opacity = elOpacity(el);
  return numChildren <= 1 || opacity === 0.0 || opacity === 1.0;
}

export function tryRemoveGroup(groupEl: XEl, pushOpacity = true): boolean {
  const remove = isRemovableGroup(groupEl);
  const opacity = elOpacity(groupEl);
  if (remove) {
    const children = [...groupEl.children];
    if (groupEl.parent !== null) {
      replaceEl(groupEl, children);
    }
    if (pushOpacity) {
      for (const child of children) {
        inheritAttrib({ opacity: ntos(opacity) }, child);
      }
    }
  } else {
    // We're keeping the group, but we promised groups only have opacity
    groupEl.attrib.clear();
    groupEl.attrib.set('opacity', ntos(opacity));
    dropDefaultAttrib(groupEl.attrib);
  }
  return remove;
}

export function elementTransform(
  el: XEl,
  currentTransform = Affine2D.identity()
): Affine2D {
  const attr = isGradient(el.tag) ? 'gradientTransform' : 'transform';
  const raw = el.attrib.get(attr);
  if (raw) {
    return Affine2D.composeLtr([Affine2D.fromString(raw), currentTransform]);
  }
  return currentTransform;
}

export function idOfTarget(url: string): string {
  const match = URL_ID_REFERENCE.exec(url);
  if (!match) {
    throw new Error(`Unrecognized url "${url}"`);
  }
  return match[1]!;
}

export function parseViewBox(s: string): Rect {
  const box = s
    .split(VIEWBOX_SEPARATOR)
    .filter((v) => v)
    .map((v) => parseFloat(v));
  if (box.length !== 4 || box.some((v) => Number.isNaN(v))) {
    throw new Error(`Unable to parse viewBox: ${s}`);
  }
  return { x: box[0]!, y: box[1]!, w: box[2]!, h: box[3]! };
}
