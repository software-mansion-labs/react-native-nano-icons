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
  loadNanoIconsConfig,
  loadDynamicIconSets,
  loadDynamicSetsFromAppConfig,
  buildAllFonts,
  buildAllSymbols,
  linkBare,
  linkBareSymbols,
  linkBareAndroidDrawables,
} from '../cli/index.js';

async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  const dynamic = process.argv.includes('--dynamic');
  const appConfig = process.argv.includes('--app-config');
  const level = verbose ? 'verbose' : 'normal';

  const pathIdx = process.argv.indexOf('--path');
  const projectRoot = process.cwd();
  const configRoot =
    pathIdx !== -1 && process.argv[pathIdx + 1]
      ? path.resolve(projectRoot, process.argv[pathIdx + 1]!)
      : projectRoot;

  const logger = await createOraLogger(level);

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

    if (config.iconSets?.length) {
      const built = await buildAllFonts(config.iconSets, projectRoot, {
        logger,
      });
      await linkBare(projectRoot, built, logger);
    }

    if (config.symbolSets?.length) {
      const builtSymbols = await buildAllSymbols(
        config.symbolSets,
        projectRoot,
        { logger }
      );
      await linkBareSymbols(projectRoot, builtSymbols, logger);
      await linkBareAndroidDrawables(projectRoot, builtSymbols, logger);
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
