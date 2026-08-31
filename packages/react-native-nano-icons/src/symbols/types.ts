// Returned by nativeNanoSymbol(). Structurally matches react-navigation's `Icon`
// so it spreads into `tabBarIcon`, without importing it (keeps this module RN-nav-free).
export type NativeNanoSymbol =
  | { type: 'sfSymbol'; name: string }
  | { type: 'image'; source: { uri: string }; tinted?: boolean };

// As NativeNanoSymbol, but the iOS `name` is narrowed to the `${prefix}.${name}`
// literal so a spread type-checks against an SFSymbolNames-augmented `sfSymbol`
// name (react-navigation #13166) with no cast.
export type NanoSymbolDescriptor<Name extends string, P extends string> =
  | { type: 'sfSymbol'; name: `${P}.${Name}` }
  | { type: 'image'; source: { uri: string }; tinted?: boolean };
