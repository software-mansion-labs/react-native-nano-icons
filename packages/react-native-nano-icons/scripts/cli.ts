#!/usr/bin/env node
/**
 * Run from your app root: npx react-native-nano-icons [--verbose] [--path <dir|file>] [--dynamic] [--dynamic-app-config] [--help]
 *
 * Flags:
 *   -h, --help         Print usage and exit without building
 *   --verbose          Show per-SVG processing details and pipeline timing
 *   --path <dir|file>  An app folder (has a package.json): read the config, build and link there.
 *                      Any other folder or .nanoicons.json: read the config there, link in the
 *                      current directory. Paths in .nanoicons.json are relative to its folder. Default: cwd.
 *   --dynamic          Rebuild only icon sets with linking: 'dynamic'. Skips native linking —
 *                      use this for OTA font regeneration without running expo prebuild.
 *   --dynamic-app-config  Like --dynamic, but reads the config from the Expo app config
 *                      (app.json / app.config.js / app.config.ts) instead of .nanoicons.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  createOraLogger,
  type NanoLogger,
  loadNanoIconsConfig,
  loadDynamicIconSets,
  loadDynamicSetsFromAppConfig,
  buildAllFonts,
  buildAllSymbols,
  IconSetBuildError,
  SymbolSetBuildError,
  linkBare,
  linkBareSymbols,
  linkBareAndroidDrawables,
  type BuiltFont,
  type BuiltSymbolSet,
} from '../cli/index';

export const USAGE = `Usage: npx react-native-nano-icons [options]

Builds the icon fonts and native symbols from .nanoicons.json and links them into ios/ and android/.

Options:
  --path <dir|file>     Folder with .nanoicons.json, or the file itself. Default: current directory.
  --dynamic             Rebuild only icon sets with linking: "dynamic". Skips native linking.
  --dynamic-app-config  Like --dynamic, but reads the sets from the Expo app config.
  --verbose             Show per-SVG processing details.
  -h, --help            Show this help.`;

const CONFIG_FILE_NAME = '.nanoicons.json';

const OPTIONS = {
  path: { type: 'string' },
  dynamic: { type: 'boolean' },
  'dynamic-app-config': { type: 'boolean' },
  verbose: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

type OptionName = keyof typeof OPTIONS;

export type CliOptions = {
  path?: string;
  dynamic: boolean;
  appConfig: boolean;
  verbose: boolean;
  help: boolean;
};

export class CliUsageError extends Error {}

function isOptionName(name: string): name is OptionName {
  return Object.hasOwn(OPTIONS, name);
}

export function parseCliArgs(args: string[]): CliOptions {
  const { tokens } = parseArgs({
    args,
    options: OPTIONS,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  const options: CliOptions = {
    dynamic: false,
    appConfig: false,
    verbose: false,
    help: false,
  };

  if (
    tokens.some((token) => token.kind === 'option' && token.name === 'help')
  ) {
    return { ...options, help: true };
  }

  const seen = new Set<OptionName>();
  for (const token of tokens) {
    if (token.kind === 'option-terminator') continue;
    if (token.kind === 'positional') {
      throw new CliUsageError(`Unexpected argument "${token.value}".`);
    }
    if (token.name === 'app-config') {
      throw new CliUsageError(
        `Unknown option ${token.rawName}. Use --dynamic-app-config instead.`
      );
    }
    if (!isOptionName(token.name)) {
      throw new CliUsageError(`Unknown option ${token.rawName}.`);
    }
    if (seen.has(token.name)) {
      throw new CliUsageError(`${token.rawName} is given more than once.`);
    }
    seen.add(token.name);

    if (OPTIONS[token.name].type === 'string') {
      if (
        token.value === undefined ||
        (!token.inlineValue && token.value.startsWith('-'))
      ) {
        throw new CliUsageError(`${token.rawName} needs a value.`);
      }
      options.path = token.value;
      continue;
    }

    if (token.value !== undefined) {
      throw new CliUsageError(`${token.rawName} does not take a value.`);
    }
    if (token.name === 'dynamic') options.dynamic = true;
    if (token.name === 'dynamic-app-config') {
      options.dynamic = true;
      options.appConfig = true;
    }
    if (token.name === 'verbose') options.verbose = true;
  }

  if (seen.has('dynamic') && seen.has('dynamic-app-config')) {
    throw new CliUsageError(
      '--dynamic and --dynamic-app-config cannot be used together.'
    );
  }

  return options;
}

export async function main(
  logger: NanoLogger,
  options: CliOptions
): Promise<void> {
  const { dynamic, appConfig } = options;

  const { appRoot, configRoot } = resolveRoots(options.path);
  const buildRoot = appConfig ? appRoot : configRoot;

  if (dynamic) {
    const source = appConfig ? 'Expo app config' : '.nanoicons.json';
    logger.start(`Reading dynamic icon sets from ${source}...`);

    const dynamicIconSets = appConfig
      ? loadDynamicSetsFromAppConfig(appRoot)
      : loadDynamicIconSets(configRoot);

    logger.succeed(
      `Found ${dynamicIconSets.length} dynamic icon set(s) — skipping native linking.`
    );

    await buildAllFonts(dynamicIconSets, buildRoot, { logger });
  } else {
    const config = loadNanoIconsConfig(configRoot);
    let buildError: IconSetBuildError | SymbolSetBuildError | undefined;

    if (config.iconSets?.length) {
      let built: BuiltFont[];
      try {
        built = await buildAllFonts(config.iconSets, buildRoot, { logger });
      } catch (err) {
        if (!(err instanceof IconSetBuildError)) throw err;
        buildError = err;
        built = err.built;
      }

      await linkBare(appRoot, built, logger, config.iconSets.length);
    }

    if (config.symbolSets?.length) {
      let builtSymbols: BuiltSymbolSet[];
      try {
        builtSymbols = await buildAllSymbols(config.symbolSets, buildRoot, {
          logger,
        });
      } catch (err) {
        if (!(err instanceof SymbolSetBuildError)) throw err;
        buildError ??= err;
        builtSymbols = err.built;
      }

      await linkBareSymbols(appRoot, builtSymbols, logger);
      await linkBareAndroidDrawables(appRoot, builtSymbols, logger);
    }

    if (buildError) throw buildError;
  }
}

function resolveRoots(target: string | undefined): {
  appRoot: string;
  configRoot: string;
} {
  const cwd = process.cwd();
  if (!target) return { appRoot: cwd, configRoot: cwd };
  const resolved = path.resolve(cwd, target);
  const isFile = fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  if (isFile && path.basename(resolved) !== CONFIG_FILE_NAME) {
    throw new CliUsageError(
      `--path must be a folder or a ${CONFIG_FILE_NAME} file, got ${target}.`
    );
  }
  const configRoot = isFile ? path.dirname(resolved) : resolved;
  const isApp = fs.existsSync(path.join(configRoot, 'package.json'));
  return { appRoot: isApp ? configRoot : cwd, configRoot };
}

export async function runCli(args: string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCliArgs(args);
  } catch (err) {
    if (!(err instanceof CliUsageError)) throw err;
    console.error(`${err.message}\n\n${USAGE}`);
    return 1;
  }

  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const logger = await createOraLogger(options.verbose ? 'verbose' : 'normal');
  try {
    await main(logger, options);
    return 0;
  } catch (err) {
    if (err instanceof CliUsageError) {
      logger.fail(`${err.message}\n\n${USAGE}`);
    } else {
      logger.fail(err instanceof Error ? err.message : String(err));
    }
    return 1;
  }
}

if (require.main === module) {
  void runCli(process.argv.slice(2)).then((code) => {
    if (code !== 0) process.exit(code);
  });
}
