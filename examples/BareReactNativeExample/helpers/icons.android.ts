import type { Icon } from '@react-navigation/elements';

// Built-in system symbols: SF Symbol on iOS, Material Symbol on Android.
// (Custom nano symbols use `nativeNanoSymbol` from 'react-native-nano-icons/symbols'.)
export const system = (_sfName: string, materialName: string): Icon =>
  ({ type: 'materialSymbol', name: materialName }) as Icon;
