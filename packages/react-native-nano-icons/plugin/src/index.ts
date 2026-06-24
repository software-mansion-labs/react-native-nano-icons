import type { ConfigPlugin } from '@expo/config-plugins';
import { withNanoIconsFontLinking } from './withNanoIconsFontLinking.js';
import { withNanoIconsSymbolLinking } from './withNanoIconsSymbolLinking.js';
import { withNanoIconsDrawableLinking } from './withNanoIconsDrawableLinking.js';
import type { NanoIconsPluginOptions } from './types.js';

const withNanoIcons: ConfigPlugin<NanoIconsPluginOptions> = (
  config,
  options
) => {
  if (options?.iconSets?.length) {
    config = withNanoIconsFontLinking(config, options.iconSets);
  }

  if (options?.symbolSets?.length) {
    config = withNanoIconsSymbolLinking(config, options.symbolSets);
    config = withNanoIconsDrawableLinking(config, options.symbolSets);
  }

  return config;
};

export default withNanoIcons;
export type {
  NanoIconsPluginOptions,
  IconSetConfig,
  SymbolSetConfig,
  BuiltFont,
  BuiltSymbolSet,
} from './types.js';
