// examples/BareReactNativeExample/metro.config.js
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');

const appRoot = __dirname;
const repoRoot = path.resolve(appRoot, '../..');

const packagesRoot = path.resolve(repoRoot, 'packages');

// Patched dependency lives here.
const nanoIconsNodeModules = path.resolve(
  repoRoot,
  'packages/react-native-nano-icons/node_modules',
);

// Roots to keep Metro from crawling.
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

  // Watch workspace packages and the patched dependency.
  watchFolders: [packagesRoot, nanoIconsNodeModules],

  resolver: {
    // App deps first, then patched library deps, then repo root.
    nodeModulesPaths: [
      path.resolve(appRoot, 'node_modules'),
      nanoIconsNodeModules,
      path.resolve(repoRoot, 'node_modules'),
    ],

    // Pin React/RN to the app's copies to match the native binary.
    extraNodeModules: {
      react: path.resolve(appRoot, 'node_modules/react'),
      'react-native': path.resolve(appRoot, 'node_modules/react-native'),
    },

    resolveRequest: (context, moduleName, platform) => {
      // Force single copies of native modules; duplicates re-register views and crash.
      const FORCED_SINGLETONS = [
        'react',
        'react-native',
        'react-native-safe-area-context',
        'react-native-gesture-handler',
        'react-native-screens',
        'react-native-reanimated',
        'react-native-worklets',
        'react-native-svg',
        'react-native-pager-view',
      ];
      if (
        FORCED_SINGLETONS.some(
          (m) => moduleName === m || moduleName.startsWith(`${m}/`)
        )
      ) {
        return context.resolveRequest(
          { ...context, originModulePath: path.join(appRoot, '_entry.js') },
          moduleName,
          platform,
        );
      }
      // Map nano-icons' exports-only "/symbols" subpath by hand (package exports
      // are off). Point at the platform-split source; Metro transforms the TS.
      if (moduleName === 'react-native-nano-icons/symbols') {
        const fs = require('fs');
        const dir = path.join(
          packagesRoot,
          'react-native-nano-icons/src/symbols',
        );
        const candidates = [
          path.join(dir, `index.${platform}.ts`),
          path.join(dir, 'index.native.ts'),
          path.join(dir, 'index.ts'),
        ];
        return {
          type: 'sourceFile',
          filePath:
            candidates.find((f) => fs.existsSync(f)) ||
            candidates[candidates.length - 1],
        };
      }
      // Map this exports-only subpath by hand since package exports are off.
      if (moduleName === '@react-navigation/elements/internal') {
        const elementsPkg = require.resolve(
          '@react-navigation/elements/package.json',
          { paths: [appRoot] },
        );
        return {
          type: 'sourceFile',
          filePath: path.join(
            path.dirname(elementsPkg),
            'lib/module/internal.js',
          ),
        };
      }
      // Stub this optional peer to an empty module; elements handles its absence.
      if (moduleName === '@callstack/liquid-glass') {
        return { type: 'empty' };
      }
      return context.resolveRequest(context, moduleName, platform);
    },

    // Don't scan the other example projects.
    blockList: baseBlockList.concat([
      new RegExp(`^${escapeRegExp(expoExampleRoot)}[/\\\\].*`),
      new RegExp(`^${escapeRegExp(nanoIconsBenchmarkingRoot)}[/\\\\].*`),
    ]),

    unstable_enableSymlinks: true,

    // Ignore package.json "exports" in the monorepo.
    unstable_enablePackageExports: false,
  },
});
