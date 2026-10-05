import type { IconSetConfig } from './build';

type ExpoGetConfig = (
  projectRoot: string,
  opts?: { skipSDKVersionRequirement?: boolean }
) => { exp: { plugins?: unknown[] } };

/**
 * Load icon sets configured with linking: 'dynamic' from the Expo app config
 * (app.json, app.config.js, or app.config.ts).
 *
 * Loads the config through the app's expo/config (present in all Expo projects),
 * falling back to @expo/config.
 */
export function loadDynamicSetsFromAppConfig(
  projectRoot: string
): IconSetConfig[] {
  const dynamicSets = loadIconSetsFromAppConfig(projectRoot).filter(
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

export function loadIconSetsFromAppConfig(
  projectRoot: string
): IconSetConfig[] {
  const configModule = resolveExpoConfigModule(projectRoot);
  if (!configModule) {
    throw new Error(
      `[react-native-nano-icons] Could not find expo/config or @expo/config from ${projectRoot} — required for --dynamic --app-config.\n` +
        `Run the command from your Expo app root, or pass --path <app root>.`
    );
  }
  const { getConfig } = require(configModule) as { getConfig: ExpoGetConfig };

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
  return options.iconSets ?? [];
}

function resolveExpoConfigModule(projectRoot: string): string | undefined {
  const candidates: [string, string[]][] = [
    ['expo/config', [projectRoot]],
    ['@expo/config', [projectRoot, __dirname]],
  ];
  for (const [request, paths] of candidates) {
    try {
      return require.resolve(request, { paths });
    } catch {
      continue;
    }
  }
  return undefined;
}
