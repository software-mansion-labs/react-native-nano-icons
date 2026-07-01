import { toDrawableResourceName } from '../utils/naming';
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
 * Resolve a forged icon (by its SVG filename) to an Android tab-bar descriptor.
 *
 * The drawable resource name is derived from `${prefix}.${name}` with the same
 * pure transform the build uses, so no name table is bundled. `tinted` controls
 * whether the bar recolors the drawable — pass `false` (e.g. `!focused`) to keep a
 * multicolor drawable's own colors.
 *
 *     tabBarIcon: ({ focused }) => nativeNanoSymbol('walking', !focused)
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
  tinted: boolean = true,
  prefix: string = 'nano'
): NativeNanoSymbol {
  return {
    type: 'image',
    source: { uri: toDrawableResourceName(`${prefix}.${name}`) },
    tinted,
  };
}
