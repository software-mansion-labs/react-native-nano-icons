type CreateIconSetFn = (...args: unknown[]) => unknown;
type ConfigPluginFn = (...args: unknown[]) => unknown;

const createNanoIconSet = (...args: unknown[]) => {
  const { createIconSet } = require('./createNanoIconsSet') as {
    createIconSet: CreateIconSetFn;
  };
  return createIconSet(...args);
};

const plugin = (require('./plugin/src/index') as { default: ConfigPluginFn })
  .default;

module.exports = Object.assign(plugin, { createNanoIconSet });
