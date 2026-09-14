import type { ConfigPlugin } from '@expo/config-plugins';
import { withNanoIconsFontLinking } from './withNanoIconsFontLinking';
import { withNanoIconsSymbolLinking } from './withNanoIconsSymbolLinking';
import { withNanoIconsDrawableLinking } from './withNanoIconsDrawableLinking';
import type { NanoIconsPluginOptions } from './types';

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
} from './types';
