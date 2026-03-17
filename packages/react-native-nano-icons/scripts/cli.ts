#!/usr/bin/env node
/**
 * Bare React Native workflow: build icon fonts and link them into the native project.
 *
 * Run from your app root: npx react-native-nano-icons [--verbose] [--path <dir>]
 *
 * Reads .nanoicons.json (same shape as Expo plugin options) so Expo and bare apps
 * share one config format.
 *
 * Flags:
 *   --verbose        Show per-SVG processing details and pipeline timing
 *   --path <dir>     Directory containing .nanoicons.json (default: cwd)
 */
import path from 'node:path';
import {
  createOraLogger,
  loadNanoIconsConfig,
  buildAllFonts,
  linkBare,
} from '../cli/index.js';

async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  const level = verbose ? 'verbose' : 'normal';

  const pathIdx = process.argv.indexOf('--path');
  const projectRoot = process.cwd();
  const configRoot =
    pathIdx !== -1 && process.argv[pathIdx + 1]
      ? path.resolve(projectRoot, process.argv[pathIdx + 1])
      : projectRoot;

  const logger = await createOraLogger(level);
  const config = loadNanoIconsConfig(configRoot);
  const built = await buildAllFonts(config.iconSets, projectRoot, { logger });
  await linkBare(projectRoot, built, logger);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
