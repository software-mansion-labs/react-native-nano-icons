import { Platform } from 'react-native';

import { nativeNanoSymbol as androidNanoSymbol } from './index.android';
import { nativeNanoSymbol as iosNanoSymbol } from './index.ios';

/**
 * Runtime platform split for React Native. Metro resolves package `exports`
 * targets verbatim — it never expands `.ios`/`.android` for them — so the
 * filename-based split the source uses cannot survive the `exports` map.
 */
export const nativeNanoSymbol: typeof iosNanoSymbol =
  Platform.OS === 'android' ? androidNanoSymbol : iosNanoSymbol;
