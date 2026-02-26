#!/usr/bin/env node
/**
 * Bare React Native workflow: build icon fonts and link them into the native project.
 *
 * Run from your app root: npx react-native-nano-icons [--verbose]
 *
 * Reads .nanoicons.json (same shape as Expo plugin options) so Expo and bare apps
 * share one config format.
 *
 * Flags:
 *   --verbose   Show per-SVG processing details and pipeline timing
 */
import {
  createOraLogger,
  loadNanoIconsConfig,
  buildAllFonts,
  linkBare,
} from '../cli/index.js';

async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  const level = verbose ? 'verbose' : 'normal';

  const logger = await createOraLogger(level);
  const config = loadNanoIconsConfig(process.cwd());
  const built = await buildAllFonts(config.iconSets, process.cwd(), { logger });
  await linkBare(process.cwd(), built, logger);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
