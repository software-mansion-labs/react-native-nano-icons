import fs from 'node:fs';
import path from 'node:path';
import type { IconSetConfig } from './build.js';

export type NanoIconsConfig = {
  iconSets: IconSetConfig[];
};

/**
 * Load .nanoicons.json from the project root.
 * Throws with a helpful message if the file is missing or malformed.
 */
export function loadNanoIconsConfig(projectRoot: string): NanoIconsConfig {
  const configPath = path.join(projectRoot, '.nanoicons.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `[react-native-nano-icons] No .nanoicons.json found at project root (${projectRoot}).\n` +
        `Create one with: { "iconSets": [{ "inputDir": "assets/icons", "fontFamily": "MyIcons" }] }`
    );
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw) as { iconSets?: unknown[] };

  if (!config?.iconSets?.length) {
    throw new Error(
      `[react-native-nano-icons] .nanoicons.json must contain an "iconSets" array with at least one entry.`
    );
  }

  return config as NanoIconsConfig;
}
