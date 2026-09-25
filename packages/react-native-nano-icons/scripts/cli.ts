#!/usr/bin/env node
/**
 * Run from your app root: npx react-native-nano-icons [--verbose] [--path <app root>] [--dynamic] [--app-config]
 *
 * Flags:
 *   --verbose          Show per-SVG processing details and pipeline timing
 *   --path <app root>  App root to read the config from, build in and link into (default: cwd).
 *                      A path to its .nanoicons.json also works.
 *   --dynamic          Rebuild only icon sets with linking: 'dynamic'. Skips native linking —
 *                      use this for OTA font regeneration without running expo prebuild.
 *   --app-config       Read config from Expo app config (app.json / app.config.js / app.config.ts)
 *                      instead of .nanoicons.json. Must be combined with --dynamic.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  createOraLogger,
  type NanoLogger,
  loadNanoIconsConfig,
  loadDynamicIconSets,
  loadDynamicSetsFromAppConfig,
  buildAllFonts,
  IconSetBuildError,
  linkBare,
  type BuiltFont,
} from '../cli/index';

export async function main(logger: NanoLogger): Promise<void> {
  const dynamic = process.argv.includes('--dynamic');
  const appConfig = process.argv.includes('--app-config');

  const appRoot = resolveAppRoot(process.argv);

  if (dynamic) {
    const source = appConfig ? 'Expo app config' : '.nanoicons.json';
    logger.start(`Reading dynamic icon sets from ${source}...`);

    const dynamicIconSets = appConfig
      ? loadDynamicSetsFromAppConfig(appRoot)
      : loadDynamicIconSets(appRoot);

    logger.succeed(
      `Found ${dynamicIconSets.length} dynamic icon set(s) — skipping native linking.`
    );

    await buildAllFonts(dynamicIconSets, appRoot, { logger });
  } else {
    const config = loadNanoIconsConfig(appRoot);
    let built: BuiltFont[];
    let buildError: IconSetBuildError | undefined;
    try {
      built = await buildAllFonts(config.iconSets, appRoot, { logger });
    } catch (err) {
      if (!(err instanceof IconSetBuildError)) throw err;
      buildError = err;
      built = err.built;
    }

    await linkBare(appRoot, built, logger, config.iconSets.length);
    if (buildError) throw buildError;
  }
}

function resolveAppRoot(argv: string[]): string {
  const pathIdx = argv.indexOf('--path');
  const target = pathIdx !== -1 ? argv[pathIdx + 1] : undefined;
  if (!target) return process.cwd();
  const resolved = path.resolve(process.cwd(), target);
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile()
    ? path.dirname(resolved)
    : resolved;
}

if (require.main === module) {
  createOraLogger(
    process.argv.includes('--verbose') ? 'verbose' : 'normal'
  ).then((logger) =>
    main(logger).catch((err: unknown) => {
      logger.fail(err instanceof Error ? err.message : String(err));
      process.exit(1);
    })
  );
}
