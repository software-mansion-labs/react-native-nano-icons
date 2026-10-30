import type { GlyphEntry } from '../core/types';

export const ICON_CLASS = 'nano-icon';
export const STYLE_HREF = 'react-native-nano-icons';
export const STYLE_PRECEDENCE = 'react-native-nano-icons';
export const BASE_CSS =
  `:where(.${ICON_CLASS}){display:inline-block;position:relative;` +
  'width:calc(var(--nano-icon-ratio,1)*1em);height:1em;line-height:0;vertical-align:middle}' +
  `.${ICON_CLASS}>span{position:absolute;left:0;bottom:0;color:inherit;` +
  'font-family:inherit;font-size:inherit;font-weight:normal;font-style:normal;' +
  'line-height:1;white-space:pre}';
export const BASE_HREF = `${STYLE_HREF}:${shortHash(BASE_CSS)}`;

const TEXT_COLORS = new Set([
  'black',
  '#000',
  '#000f',
  '#000000',
  '#000000ff',
  'rgb(0,0,0)',
  'rgba(0,0,0,1)',
  'currentcolor',
]);

const followsTextColorByLayers = new WeakMap<GlyphEntry[1], boolean>();

export function followsTextColor(layers: GlyphEntry[1]): boolean {
  let follows = followsTextColorByLayers.get(layers);
  if (follows === undefined) {
    follows = layers.every(([, srcColor]) =>
      TEXT_COLORS.has(srcColor.replace(/\s+/g, '').toLowerCase())
    );
    followsTextColorByLayers.set(layers, follows);
  }
  return follows;
}

// @keep: 32-bit FNV-1a hash in base 36, a short and stable id for the hoisted <style> href.
export function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
