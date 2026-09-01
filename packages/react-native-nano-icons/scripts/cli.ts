#!/usr/bin/env node
/**
 * npx react-native-nano-icons [generate] [flags]   (run from your app root)
 *
 *   (default)   Build fonts, then link + install native build hooks. Run once.
 *   generate    Build + stage fonts only (no project mutation). Called by the
 *               Xcode phase / Gradle task on every build.
 *
 * Flags:
 *   --verbose          Per-SVG processing and pipeline timing.
 *   --root <dir>       Project root (default: cwd). Build hooks pass this since
 *                      their cwd is unreliable.
 *   --path <dir|file>  Where .nanoicons.json is. Defaults to an upward search from --root.
 *   --platform <p>     ios | android. Required for `generate`.
 *   --dynamic          Rebuild only linking: 'dynamic' sets (for OTA, no prebuild).
 *   --app-config       Read sets from the Expo app config. Combine with --dynamic.
 */
import path from 'node:path';
import {
  createOraLogger,
  loadNanoIconsConfig,
  loadDynamicIconSets,
  loadDynamicSetsFromAppConfig,
  resolveConfigPath,
  buildAllFonts,
  linkBare,
  stageFonts,
  type Platform,
} from '../cli/index.js';

function flagValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const isGenerate = process.argv[2] === 'generate';
  const verbose = process.argv.includes('--verbose');
  const dynamic = process.argv.includes('--dynamic');
  const appConfig = process.argv.includes('--app-config');
  const level = verbose ? 'verbose' : 'normal';

  const projectRoot = flagValue('--root')
    ? path.resolve(process.cwd(), flagValue('--root')!)
    : process.cwd();
  const explicitConfig = flagValue('--path');

  const logger = await createOraLogger(level);

  if (dynamic) {
    const source = appConfig ? 'Expo app config' : '.nanoicons.json';
    logger.start(`Reading dynamic icon sets from ${source}...`);

    const { configRoot } = appConfig
      ? { configRoot: projectRoot }
      : resolveConfigPath({ explicit: explicitConfig, startDir: projectRoot });

    const dynamicIconSets = appConfig
      ? loadDynamicSetsFromAppConfig(projectRoot)
      : loadDynamicIconSets(configRoot);

    logger.succeed(
      `Found ${dynamicIconSets.length} dynamic icon set(s) — skipping native linking.`
    );

    await buildAllFonts(dynamicIconSets, projectRoot, {
      logger,
      resolveRoot: configRoot,
    });
    return;
  }

  const { configRoot } = resolveConfigPath({
    explicit: explicitConfig,
    startDir: projectRoot,
  });
  const config = loadNanoIconsConfig(configRoot);
  const built = await buildAllFonts(config.iconSets, projectRoot, {
    logger,
    resolveRoot: configRoot,
  });

  if (isGenerate) {
    const platform = flagValue('--platform') as Platform | undefined;
    if (platform !== 'ios' && platform !== 'android') {
      throw new Error(
        `[react-native-nano-icons] generate requires --platform ios|android.`
      );
    }
    await stageFonts(projectRoot, built, platform, logger);
    return;
  }

  await linkBare(projectRoot, built, logger);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
