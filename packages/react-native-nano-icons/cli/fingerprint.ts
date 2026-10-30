import { fingerprintIconSets } from './build';
import { fingerprintSymbolSets } from './buildSymbols';
import { findPluginOptions } from './expoConfig';

/** An `@expo/fingerprint` hash source of type `contents`. */
export type FingerprintSource = {
  type: 'contents';
  id: string;
  contents: string;
  reasons: string[];
};

const REASONS = ['react-native-nano-icons'];

/**
 * `extraSources` for `fingerprint.config.js`, read from the plugin options in the Expo app config.
 * Icon sets with `linking: 'static'` and symbol sets are built into the native app, so each adds its
 * input fingerprint: its SVGs, its options, and the installed library and font toolchain versions.
 * Dynamic icon sets are left out, because an update delivers them.
 * Returns no sources when the plugin is not configured, and warns and returns none when the sets can't be read.
 */
export function nanoIconsFingerprintSources(
  projectRoot: string
): FingerprintSource[] {
  try {
    const options = findPluginOptions(projectRoot);
    const iconSets = fingerprintIconSets(
      (options?.iconSets ?? []).filter((set) => set.linking !== 'dynamic'),
      projectRoot
    ).map(({ fontFamily, hash }) => ({
      type: 'contents' as const,
      id: `react-native-nano-icons:iconSet:${fontFamily}`,
      contents: hash,
      reasons: REASONS,
    }));
    const symbolSets = fingerprintSymbolSets(
      options?.symbolSets ?? [],
      projectRoot
    ).map(({ name, hash }) => ({
      type: 'contents' as const,
      id: `react-native-nano-icons:symbolSet:${name}`,
      contents: hash,
      reasons: REASONS,
    }));
    return [...iconSets, ...symbolSets];
  } catch (err) {
    console.warn(
      `[react-native-nano-icons] No fingerprint sources added: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return [];
  }
}
