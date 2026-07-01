import type { Icon } from '@react-navigation/elements';

// Built-in system symbols: SF Symbol on iOS, Material Symbol on Android.
// (Custom nano symbols use `nativeNanoSymbol` from 'react-native-nano-icons/symbols'.)
export const system = (sfName: string, _materialName: string): Icon =>
  ({ type: 'sfSymbol', name: sfName }) as Icon;
