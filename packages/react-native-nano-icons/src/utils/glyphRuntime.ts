import type { ColorValue } from 'react-native';
import type { NanoGlyphMapInput, GlyphEntry } from '../core/types';

/** Default icon size (px) shared by every platform renderer. */
export const DEFAULT_ICON_SIZE = 12;

/**
 * Look up a glyph entry by name, falling back to a single '?' layer
 * (codepoint 63) sized to the font's em when the name is unknown.
 */
export function resolveGlyphEntry<GM extends NanoGlyphMapInput>(
  glyphMap: GM,
  name: keyof GM['i']
): GlyphEntry {
  return (glyphMap.i[name as string] ?? [
    glyphMap.m.u,
    [[63, 'black']],
  ]) as GlyphEntry;
}

/** A memoized codepoint -> string converter, scoped per icon set. */
export function createCharCache(): (codepoint: number) => string {
  const cache = new Map<number, string>();
  return (codepoint) => {
    let ch = cache.get(codepoint);
    if (ch === undefined) {
      ch = String.fromCodePoint(codepoint);
      cache.set(codepoint, ch);
    }
    return ch;
  };
}

/**
 * Build a per-layer color resolver for one render: an explicit per-index
 * color wins, else the last supplied palette color spills onto remaining
 * layers, else the glyph's own source color, else black.
 */
export function createLayerColorResolver(
  color: ColorValue | ColorValue[] | undefined
): (index: number, srcColor: string | undefined) => ColorValue {
  const colorArray = Array.isArray(color) ? color : [color];
  const lastPaletteColor = colorArray[colorArray.length - 1];
  return (index, srcColor) =>
    colorArray[index] ?? lastPaletteColor ?? srcColor ?? 'black';
}
