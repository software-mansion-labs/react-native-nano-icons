import type { Context } from 'react';
import * as ReactNative from 'react-native';

type ReactNativeWithTextAncestor = {
  unstable_TextAncestorContext?: Context<boolean>;
};

export const TextAncestorContext: Context<boolean> =
  (ReactNative as ReactNativeWithTextAncestor).unstable_TextAncestorContext ??
  require('./textAncestorLegacy').LegacyTextAncestorContext;
