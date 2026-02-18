// examples/BareReactNativeExample/metro.config.js
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const appRoot = __dirname;
const repoRoot = path.resolve(appRoot, '../..');

const packagesRoot = path.resolve(repoRoot, 'packages');

// This is where your patched dependency actually lives:
const nanoIconsNodeModules = path.resolve(
  repoRoot,
  'packages/react-native-nano-icons/node_modules',
);

// Optional: keep Bare from crawling into Expo example
// (adjust folder name if your Expo example directory is different)
const expoExampleRoot = path.resolve(repoRoot, 'examples/ExpoExample');

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const defaultConfig = getDefaultConfig(appRoot);
const baseBlockList = Array.isArray(defaultConfig.resolver.blockList)
  ? defaultConfig.resolver.blockList
  : [defaultConfig.resolver.blockList].filter(Boolean);

module.exports = mergeConfig(defaultConfig, {
  projectRoot: appRoot,

  // Metro must be able to watch+hash the patched dependency files
  // and also watch workspace packages for live edits.
  watchFolders: [packagesRoot, nanoIconsNodeModules],

  resolver: {
    // Prefer app deps first, then the library workspace deps (patched),
    // then the repo root as a fallback.
    nodeModulesPaths: [
      path.resolve(appRoot, 'node_modules'),
      nanoIconsNodeModules,
      path.resolve(repoRoot, 'node_modules'),
    ],

    // CRITICAL: Keep React/RN singletons aligned with the Bare native binary.
    // This avoids TurboModuleRegistry / PlatformConstants mismatches.
    extraNodeModules: {
      react: path.resolve(appRoot, 'node_modules/react'),
      'react-native': path.resolve(appRoot, 'node_modules/react-native'),
    },

    // Optional: prevent Metro from scanning the Expo example
    blockList: baseBlockList.concat([
      new RegExp(`^${escapeRegExp(expoExampleRoot)}[/\\\\].*`),
    ]),

    unstable_enableSymlinks: true,

    // Makes Metro less sensitive to package.json "exports" in monorepos
    unstable_enablePackageExports: false,
  },
});
