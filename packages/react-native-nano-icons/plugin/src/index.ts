import type {
  ConfigPlugin,
  ExportedConfigWithProps,
} from '@expo/config-plugins';
import { withDangerousMod } from '@expo/config-plugins';
import { buildAllFonts } from './buildFonts.js';
import { withNanoIconsFontLinking } from './linkFonts.js';
import type {
  NanoIconsPluginOptions,
  IconSetConfig,
  BuiltFont,
} from './types.js';

const BUILT_FONTS_KEY = '_nanoIconsBuilt';

// Single Pyodide/PathKit run for the whole prebuild; reused across ios/android mods.
let _builtFontsCache: BuiltFont[] | null = null;

function getOrBuildFonts(
  projectRoot: string,
  iconSets: IconSetConfig[]
): Promise<BuiltFont[]> {
  if (_builtFontsCache) return Promise.resolve(_builtFontsCache);
  return buildAllFonts(iconSets, projectRoot).then((built: BuiltFont[]) => {
    _builtFontsCache = built;
    return built;
  });
}

const withNanoIcons: ConfigPlugin<NanoIconsPluginOptions> = (
  config,
  options
) => {
  if (!options?.iconSets?.length) return config;

  // Build fonts (once per process, cached) and attach to config for linking mods.
  config = withDangerousMod(config, [
    'ios',
    async (config: ExportedConfigWithProps<unknown>) => {
      const projectRoot = config.modRequest.projectRoot;
      const built = await getOrBuildFonts(projectRoot, options.iconSets);
      (config as unknown as Record<string, unknown>)[BUILT_FONTS_KEY] = built;
      return config;
    },
  ]);

  config = withDangerousMod(config, [
    'android',
    async (config: ExportedConfigWithProps<unknown>) => {
      const projectRoot = config.modRequest.projectRoot;
      const built = await getOrBuildFonts(projectRoot, options.iconSets);
      (config as unknown as Record<string, unknown>)[BUILT_FONTS_KEY] = built;
      return config;
    },
  ]);

  // Link built TTFs into native projects (reads _nanoIconsBuilt from config).
  config = withNanoIconsFontLinking(config);

  return config;
};

export default withNanoIcons;
export type {
  NanoIconsPluginOptions,
  IconSetConfig,
  BuiltFont,
} from './types.js';
