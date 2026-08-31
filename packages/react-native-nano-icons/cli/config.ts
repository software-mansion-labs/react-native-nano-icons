import fs from 'node:fs';
import path from 'node:path';
import type { IconSetConfig } from './build.js';
import type { SymbolSetConfig } from './buildSymbols.js';

export type NanoIconsConfig = {
  iconSets?: IconSetConfig[];
  symbolSets?: SymbolSetConfig[];
};

/**
 * Load .nanoicons.json from the given directory.
 * Throws with a helpful message if the file is missing or malformed.
 */
export function loadNanoIconsConfig(configRoot: string): NanoIconsConfig {
  const configPath = path.join(configRoot, '.nanoicons.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `🔬❌ [react-native-nano-icons] No .nanoicons.json found at (${configRoot}).\n` +
        `Create one with: { "iconSets": [{ "inputDir": "assets/icons", "fontFamily": "MyIcons" }] } \n` +
        `Or run with --path <dir> to specify a different directory.`
    );
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw) as {
    iconSets?: unknown[];
    symbolSets?: unknown[];
  };

  if (!config?.iconSets?.length && !config?.symbolSets?.length) {
    throw new Error(
      `🔬❌ [react-native-nano-icons] .nanoicons.json must contain an "iconSets" or "symbolSets" array with at least one entry.`
    );
  }

  return config as NanoIconsConfig;
}

export function loadDynamicIconSets(configRoot: string): IconSetConfig[] {
  const config = loadNanoIconsConfig(configRoot);
  const dynamicSets = (config.iconSets ?? []).filter(
    (s) => s.linking === 'dynamic'
  );

  if (dynamicSets.length === 0) {
    throw new Error(
      `[react-native-nano-icons] No icon sets with linking: "dynamic" found in .nanoicons.json.\n` +
        `--dynamic only processes icon sets where linking is set to "dynamic".`
    );
  }

  return dynamicSets;
}
