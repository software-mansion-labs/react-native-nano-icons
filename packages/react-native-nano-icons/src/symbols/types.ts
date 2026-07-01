/**
 * Descriptor returned by {@link nativeNanoSymbol}. Structurally compatible with
 * react-navigation's `Icon` (elements) so it can be spread straight into
 * `tabBarIcon` — but intentionally NOT importing it, to keep this module free of
 * a react-navigation dependency.
 */
export type NativeNanoSymbol =
  | { type: 'sfSymbol'; name: string }
  | { type: 'image'; source: { uri: string }; tinted?: boolean };

/**
 * Same as {@link NativeNanoSymbol} but with the iOS `name` narrowed to the exact
 * `${prefix}.${name}` literal, so a spread into `tabBarIcon` type-checks against a
 * `SFSymbolNames`-augmented `sfSymbol` name (react-navigation #13166) with no cast.
 */
export type NanoSymbolDescriptor<Name extends string, P extends string> =
  | { type: 'sfSymbol'; name: `${P}.${Name}` }
  | { type: 'image'; source: { uri: string }; tinted?: boolean };
