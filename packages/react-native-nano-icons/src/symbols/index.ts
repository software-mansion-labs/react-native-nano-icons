import type { NanoSymbolDescriptor, NativeNanoSymbol } from './types';

export type { NativeNanoSymbol, NanoSymbolDescriptor } from './types';

/**
 * Augmentable registry of forged icon names. The build emits a `.d.ts` per symbol
 * set that augments this interface, so `nativeNanoSymbol()` accepts that set's SVG
 * filenames (and autocompletes them) with no explicit generic.
 */
export interface NanoSymbolNames {}

/** Accepted icon names — the augmented union, or any string until a set is generated. */
type NanoSymbolName = [keyof NanoSymbolNames] extends [never]
  ? string
  : Extract<keyof NanoSymbolNames, string>;

/**
 * Resolve a forged icon (by its SVG filename) to a native tab-bar descriptor.
 *
 * iOS — the asset is referenced by its asset-catalog name via the `sfSymbol`
 * path. Coloring is fixed at build time by the asset's render intent: a
 * monochrome `.symbolset` (`template`) is tinted by the bar, a multicolor
 * `.imageset` (`original`) keeps its colors. `tinted` has no effect and is ignored.
 *
 * Android — the drawable resource name is derived from `${prefix}.${name}` with
 * the same pure transform the build uses. `tinted` controls whether the bar
 * recolors the drawable — pass `false` (e.g. `!focused`) to keep a multicolor
 * drawable's own colors.
 *
 *     tabBarIcon: () => nativeNanoSymbol('home')
 *     // tints only when unfocused, keeps the icon's own colors while focused
 *     tabBarIcon: ({ focused }) => nativeNanoSymbol('home', !focused)
 */
export function nativeNanoSymbol<Name extends NanoSymbolName>(
  name: Name,
  tinted?: boolean
): NanoSymbolDescriptor<Name, 'nano'>;
export function nativeNanoSymbol<Name extends NanoSymbolName, P extends string>(
  name: Name,
  tinted: boolean | undefined,
  prefix: P
): NanoSymbolDescriptor<Name, P>;
export function nativeNanoSymbol(
  name: string,
  _tinted?: boolean,
  prefix: string = 'nano'
): NativeNanoSymbol {
  return { type: 'sfSymbol', name: `${prefix}.${name}` };
}
