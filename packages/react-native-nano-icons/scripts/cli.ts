#!/usr/bin/env node
/**
 * Run from your app root: npx react-native-nano-icons [--verbose] [--path <dir>] [--dynamic] [--app-config]
 *
 * Flags:
 *   --verbose          Show per-SVG processing details and pipeline timing
 *   --path <dir>       Directory containing .nanoicons.json (default: cwd)
 *   --dynamic          Rebuild only icon sets with linking: 'dynamic'. Skips native linking —
 *                      use this for OTA font regeneration without running expo prebuild.
 *   --app-config       Read config from Expo app config (app.json / app.config.js / app.config.ts)
 *                      instead of .nanoicons.json. Must be combined with --dynamic.
 */
import path from 'node:path';
import {
  createOraLogger,
  type NanoLogger,
  loadNanoIconsConfig,
  loadDynamicIconSets,
  loadDynamicSetsFromAppConfig,
  buildAllFonts,
  linkBare,
} from '../cli/index';

async function main(logger: NanoLogger): Promise<void> {
  const dynamic = process.argv.includes('--dynamic');
  const appConfig = process.argv.includes('--app-config');

  const pathIdx = process.argv.indexOf('--path');
  const projectRoot = process.cwd();
  const configRoot =
    pathIdx !== -1 && process.argv[pathIdx + 1]
      ? path.resolve(projectRoot, process.argv[pathIdx + 1]!)
      : projectRoot;

  if (dynamic) {
    const source = appConfig ? 'Expo app config' : '.nanoicons.json';
    logger.start(`Reading dynamic icon sets from ${source}...`);

    const dynamicIconSets = appConfig
      ? loadDynamicSetsFromAppConfig(projectRoot)
      : loadDynamicIconSets(configRoot);

    logger.succeed(
      `Found ${dynamicIconSets.length} dynamic icon set(s) — skipping native linking.`
    );

    await buildAllFonts(dynamicIconSets, projectRoot, { logger });
  } else {
    const config = loadNanoIconsConfig(configRoot);
    const built = await buildAllFonts(config.iconSets, projectRoot, { logger });

    await linkBare(projectRoot, built, logger);
  }
}

createOraLogger(process.argv.includes('--verbose') ? 'verbose' : 'normal').then(
  (logger) =>
    main(logger).catch((err: unknown) => {
      logger.fail(err instanceof Error ? err.message : String(err));
      process.exit(1);
    })
);
