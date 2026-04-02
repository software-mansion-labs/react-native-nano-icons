const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');

// We want ExpoExample to ignore the Bare example folder entirely.
const bareExampleRoot = path.resolve(
  repoRoot,
  'examples/BareReactNativeExample'
);

const nanoIconsBenchmarkingRoot = path.resolve(
  repoRoot,
  'examples/NanoIconsBenchmarking'
);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const config = getDefaultConfig(projectRoot);

// Metro's default blockList can be RegExp or RegExp[]
const baseBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList].filter(Boolean);

config.resolver.blockList = baseBlockList.concat([
  new RegExp(`^${escapeRegExp(bareExampleRoot)}[/\\\\].*`),
  new RegExp(`^${escapeRegExp(nanoIconsBenchmarkingRoot)}[/\\\\].*`),
]);

// Force single copies of React/RN
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'react' ||
    moduleName === 'react-native' ||
    moduleName.startsWith('react/') ||
    moduleName.startsWith('react-native/')
  ) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, '_entry.js') },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
