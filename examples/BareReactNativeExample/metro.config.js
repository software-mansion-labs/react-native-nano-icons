// examples/BareReactNativeExample/metro.config.js
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');

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
const nanoIconsBenchmarkingRoot = path.resolve(
  repoRoot,
  'examples/NanoIconsBenchmarking',
);

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

    // Force single copies of React/RN — extraNodeModules is only a fallback,
    // so we also need resolveRequest to intercept imports that would otherwise
    // resolve to the library's own node_modules.
    resolveRequest: (context, moduleName, platform) => {
      if (
        moduleName === 'react' ||
        moduleName === 'react-native' ||
        moduleName.startsWith('react/') ||
        moduleName.startsWith('react-native/')
      ) {
        return context.resolveRequest(
          { ...context, originModulePath: path.join(appRoot, '_entry.js') },
          moduleName,
          platform,
        );
      }
      // react-navigation v8 imports the `@react-navigation/elements/internal`
      // subpath export. Package exports are disabled in this monorepo config
      // (above), so map that one subpath to its physical file explicitly.
      if (moduleName === '@react-navigation/elements/internal') {
        return context.resolveRequest(
          context,
          '@react-navigation/elements/lib/module/internal',
          platform,
        );
      }
      // `@callstack/liquid-glass` is an OPTIONAL peer of @react-navigation/
      // elements (elements `require()`s it inside try/catch). We don't use it,
      // so resolve it to an empty module — elements then falls back to
      // `isLiquidGlassSupported = false`.
      if (moduleName === '@callstack/liquid-glass') {
        return { type: 'empty' };
      }
      return context.resolveRequest(context, moduleName, platform);
    },

    // Optional: prevent Metro from scanning the Expo example
    blockList: baseBlockList.concat([
      new RegExp(`^${escapeRegExp(expoExampleRoot)}[/\\\\].*`),
      new RegExp(`^${escapeRegExp(nanoIconsBenchmarkingRoot)}[/\\\\].*`),
    ]),

    unstable_enableSymlinks: true,

    // Makes Metro less sensitive to package.json "exports" in monorepos
    unstable_enablePackageExports: false,
  },
});
