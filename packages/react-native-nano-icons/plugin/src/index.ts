import type { ConfigPlugin } from '@expo/config-plugins';
import { withNanoIconsFontLinking } from './withNanoIconsFontLinking.js';
import type { NanoIconsPluginOptions } from './types.js';

const withNanoIcons: ConfigPlugin<NanoIconsPluginOptions> = (
  config,
  options
) => {
  if (!options?.iconSets?.length) return config;

  config = withNanoIconsFontLinking(config, options.iconSets);

  return config;
};

export default withNanoIcons;
export type {
  NanoIconsPluginOptions,
  IconSetConfig,
  BuiltFont,
} from './types.js';
