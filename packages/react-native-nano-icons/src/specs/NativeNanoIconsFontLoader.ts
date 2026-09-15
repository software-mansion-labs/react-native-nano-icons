import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Pass glyphMap.m.f as `family`. On iOS it must also match the TTF's embedded PostScript/full name. */
  registerFont(family: string, uri: string): Promise<boolean>;
}

// `get` (not `getEnforcing`) so the absence of the native module (web, Expo Go,
// module not built) returns null and the caller can degrade gracefully.
export default TurboModuleRegistry.get<Spec>('NanoIconsFontLoader');
