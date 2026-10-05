import type { ConfigPlugin } from '@expo/config-plugins';
import { withNanoIconsFontLinking } from './withNanoIconsFontLinking';
import type { NanoIconsPluginOptions } from './types';

const withNanoIcons: ConfigPlugin<NanoIconsPluginOptions> = (
  config,
  options
) => {
  if (!options?.iconSets?.length) return config;

  config = withNanoIconsFontLinking(config, options.iconSets);

  return config;
};

export default withNanoIcons;
export type { NanoIconsPluginOptions, IconSetConfig, BuiltFont } from './types';
