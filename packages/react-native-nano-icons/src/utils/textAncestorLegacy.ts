import { createContext, type Context } from 'react';

type ContextModule = Context<boolean> | { default: Context<boolean> };

function unwrap(mod: ContextModule): Context<boolean> {
  return 'default' in mod ? mod.default : mod;
}

function resolveLegacyTextAncestorContext(): Context<boolean> {
  try {
    return unwrap(require('react-native/Libraries/Text/TextAncestor'));
  } catch {
    return createContext(false);
  }
}

export const LegacyTextAncestorContext = resolveLegacyTextAncestorContext();
