import { toDrawableResourceName } from '../utils/naming';
import type {
  NanoSymbolDescriptor,
  NanoSymbolRenderingMode,
  NativeNanoSymbol,
} from './types';

export type {
  NativeNanoSymbol,
  NanoSymbolDescriptor,
  NanoSymbolRenderingMode,
} from './types';

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
 * path. Every forged symbol carries both rendering modes; `renderingMode`
 * picks one: `monochrome` (bar tint, default) or `original` (the SVG's own
 * colors — Apple's "multicolor" symbol rendering).
 *
 * Android — the drawable resource name is derived from `${prefix}.${name}` with
 * the same pure transform the build uses. `renderingMode` controls whether the
 * bar recolors the drawable (`monochrome`) or keeps its own colors (`original`).
 *
 *     tabBarIcon: () => nativeNanoSymbol('home')
 *     // tints only when unfocused, keeps the icon's own colors while focused
 *     tabBarIcon: ({ focused }) =>
 *       nativeNanoSymbol('home', focused ? 'original' : 'monochrome')
 */
export function nativeNanoSymbol<Name extends NanoSymbolName>(
  name: Name,
  renderingMode?: NanoSymbolRenderingMode
): NanoSymbolDescriptor<Name, 'nano'>;
export function nativeNanoSymbol<Name extends NanoSymbolName, P extends string>(
  name: Name,
  renderingMode: NanoSymbolRenderingMode | undefined,
  prefix: P
): NanoSymbolDescriptor<Name, P>;
export function nativeNanoSymbol(
  name: string,
  renderingMode: NanoSymbolRenderingMode = 'monochrome',
  prefix: string = 'nano'
): NativeNanoSymbol {
  return {
    type: 'image',
    source: { uri: toDrawableResourceName(`${prefix}.${name}`) },
    renderingMode,
  };
}
