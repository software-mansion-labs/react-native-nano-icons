import fs from 'node:fs';
import path from 'node:path';
import type { IconSetConfig } from './build.js';

export const CONFIG_FILENAME = '.nanoicons.json';

export type NanoIconsConfig = {
  iconSets: IconSetConfig[];
};

export type ResolvedConfig = {
  configPath: string;
  /** Folder holding the config; relative inputDir/outputDir resolve against this. */
  configRoot: string;
};

/**
 * Find a .nanoicons.json, even when it lives outside the project root.
 *
 * Uses `explicit` (a folder or a direct file path) if given, otherwise searches
 * upward from `startDir` like git/eslint do. Build hooks (Xcode/Gradle) have an
 * unreliable cwd, so they pass the project root as `startDir` rather than relying
 * on process.cwd().
 */
export function resolveConfigPath(opts: {
  explicit?: string;
  startDir?: string;
  stopAt?: string;
}): ResolvedConfig {
  const startDir = path.resolve(opts.startDir ?? process.cwd());

  if (opts.explicit) {
    const abs = path.resolve(startDir, opts.explicit);
    const isDir = fs.existsSync(abs) && fs.statSync(abs).isDirectory();
    const configPath = isDir ? path.join(abs, CONFIG_FILENAME) : abs;

    if (!fs.existsSync(configPath)) {
      throw new Error(
        `🔬❌ [react-native-nano-icons] No ${CONFIG_FILENAME} found at (${configPath}).\n` +
          `--path accepts either a directory containing ${CONFIG_FILENAME} or a direct path to the file.`
      );
    }

    return { configPath, configRoot: path.dirname(configPath) };
  }

  const stop = opts.stopAt
    ? path.resolve(opts.stopAt)
    : path.parse(startDir).root;
  let dir = startDir;

  for (;;) {
    const configPath = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return { configPath, configRoot: dir };
    }
    if (dir === stop || dir === path.dirname(dir)) break;
    dir = path.dirname(dir);
  }

  throw new Error(
    `🔬❌ [react-native-nano-icons] Could not locate ${CONFIG_FILENAME} searching upward from (${startDir}).\n` +
      `Create one with: { "iconSets": [{ "inputDir": "assets/icons", "fontFamily": "MyIcons" }] }\n` +
      `Or run with --path <dir|file> to point at it.`
  );
}

function parseConfigFile(configPath: string): NanoIconsConfig {
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw) as { iconSets?: unknown[] };

  if (!config?.iconSets?.length) {
    throw new Error(
      `🔬❌ [react-native-nano-icons] ${CONFIG_FILENAME} must contain an "iconSets" array with at least one entry.`
    );
  }

  return config as NanoIconsConfig;
}

/** Load .nanoicons.json from a directory, with a helpful error if it's missing. */
export function loadNanoIconsConfig(configRoot: string): NanoIconsConfig {
  const configPath = path.join(configRoot, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `🔬❌ [react-native-nano-icons] No ${CONFIG_FILENAME} found at (${configRoot}).\n` +
        `Create one with: { "iconSets": [{ "inputDir": "assets/icons", "fontFamily": "MyIcons" }] } \n` +
        `Or run with --path <dir> to specify a different directory.`
    );
  }

  return parseConfigFile(configPath);
}

export function loadDynamicIconSets(configRoot: string): IconSetConfig[] {
  const config = loadNanoIconsConfig(configRoot);
  const dynamicSets = config.iconSets.filter((s) => s.linking === 'dynamic');

  if (dynamicSets.length === 0) {
    throw new Error(
      `[react-native-nano-icons] No icon sets with linking: "dynamic" found in .nanoicons.json.\n` +
        `--dynamic only processes icon sets where linking is set to "dynamic".`
    );
  }

  return dynamicSets;
}
