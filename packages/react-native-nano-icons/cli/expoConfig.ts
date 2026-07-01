import type { IconSetConfig } from './build.js';

type ExpoGetConfig = (
  projectRoot: string,
  opts?: { skipSDKVersionRequirement?: boolean }
) => { exp: { plugins?: unknown[] } };

/**
 * Load icon sets configured with linking: 'dynamic' from the Expo app config
 * (app.json, app.config.js, or app.config.ts).
 *
 * Requires @expo/config to be installed (present in all Expo projects).
 */
export function loadDynamicSetsFromAppConfig(
  projectRoot: string
): IconSetConfig[] {
  let getConfig: ExpoGetConfig;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ getConfig } = require('@expo/config') as { getConfig: ExpoGetConfig });
  } catch {
    throw new Error(
      `[react-native-nano-icons] @expo/config not found — required for --dynamic --app-config.\n` +
        `It should already be present in Expo projects. If missing: yarn add @expo/config`
    );
  }

  const { exp } = getConfig(projectRoot, { skipSDKVersionRequirement: true });
  const plugins: unknown[] = Array.isArray(exp.plugins) ? exp.plugins : [];

  const entry = plugins.find(
    (p): p is [string, { iconSets: IconSetConfig[] }] =>
      Array.isArray(p) && p[0] === 'react-native-nano-icons'
  );

  if (!entry) {
    throw new Error(
      `[react-native-nano-icons] Plugin "react-native-nano-icons" not found in app config.\n` +
        `Add it to your app.json or app.config.js/ts under the "plugins" key.`
    );
  }

  const [, options] = entry;
  const dynamicSets = (options.iconSets ?? []).filter(
    (s) => s.linking === 'dynamic'
  );

  if (dynamicSets.length === 0) {
    throw new Error(
      `[react-native-nano-icons] No icon sets with linking: "dynamic" found.\n` +
        `--dynamic --app-config only processes icon sets where linking is set to "dynamic".`
    );
  }

  return dynamicSets;
}
