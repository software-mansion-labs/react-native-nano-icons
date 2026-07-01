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
 * Resolve a forged icon (by its SVG filename) to an iOS tab-bar descriptor.
 *
 * On iOS every forged asset — monochrome `.symbolset` and multicolor `.imageset`
 * alike — is referenced by its asset-catalog name through the `sfSymbol` path (the
 * imageset's `original` render intent keeps its colors). `tinted` is meaningless
 * here, so it is ignored.
 *
 *     tabBarIcon: () => nativeNanoSymbol('home')
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
