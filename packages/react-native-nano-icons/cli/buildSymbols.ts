import path from 'path';
import fs from 'fs';
import {
  runSymbolPipeline,
  type SymbolsPipelineResult,
  type NanoSymbolMap,
} from '../src/core/pipeline/runSymbolPipeline';
import type { SvgWorkerPool } from '../src/core/pipeline/iconPool';
import type { SymbolTask } from '../src/core/pipeline/prepareSymbol';
import type { PreparedSvgCache } from '../src/core/pipeline/preparedSvgCache';
import type { NanoLogger } from './logger';
import { fingerprintSymbolDirSync } from '../src/utils/fingerPrint';
import {
  fontToolchainVersions,
  packageVersion,
} from '../src/utils/packageVersion';

export type SymbolSetConfig = {
  /** Folder of SVG files (relative to project root). */
  inputDir: string;
  /** Set name; defaults to the inputDir basename. */
  name?: string;
  /** Symbol name prefix (default "nano"): home.svg → "nano.home". */
  prefix?: string;
  /** Output dir; defaults to a sibling nanoicons folder next to inputDir. */
  outputDir?: string;
  /** Emit colored `.imageset` (original colors) instead of monochrome `.symbolset`. */
  multicolor?: boolean;
};

export type BuiltSymbolSet = SymbolsPipelineResult;

export class SymbolSetBuildError extends Error {
  built: BuiltSymbolSet[];

  constructor(message: string, built: BuiltSymbolSet[]) {
    super(message);
    this.built = built;
  }
}

const DEFAULT_PREFIX = 'nano';

function shouldSkipGeneration(
  inputHash: string,
  outputDir: string,
  name: string,
  multicolor: boolean,
  logger?: NanoLogger
): BuiltSymbolSet | null {
  const symbolmapPath = path.join(outputDir, `${name}.symbolmap.json`);
  const dtsPath = path.join(outputDir, `${name}.symbols.d.ts`);
  const symbolsDir = path.join(outputDir, `${name}.symbols`);
  const drawablesDir = path.join(outputDir, `${name}.drawables`);

  if (
    !fs.existsSync(symbolmapPath) ||
    !fs.existsSync(dtsPath) ||
    !fs.existsSync(symbolsDir) ||
    !fs.existsSync(drawablesDir)
  ) {
    return null;
  }

  let symbolmap: NanoSymbolMap;
  try {
    symbolmap = JSON.parse(fs.readFileSync(symbolmapPath, 'utf8'));
  } catch {
    return null;
  }

  if (!symbolmap?.m?.h || symbolmap.m.h !== inputHash) return null;

  const suffix = multicolor ? 'imageset' : 'symbolset';
  const symbols = symbolmap.s ?? {};
  const drawables = symbolmap.d ?? {};
  const assetDirs = Object.values(symbols).map((assetName) =>
    path.join(symbolsDir, `${assetName}.${suffix}`)
  );
  const drawableFiles = Object.values(drawables).map((resourceName) =>
    path.join(drawablesDir, `${resourceName}.xml`)
  );
  if (!assetDirs.every((d) => fs.existsSync(d))) return null;
  if (!drawableFiles.every((f) => fs.existsSync(f))) return null;

  logger?.info(`${name}: SVG fingerprint unchanged, skipping build.`);
  return {
    name,
    prefix: symbolmap.m.p,
    symbolsDir,
    assetDirs,
    drawablesDir,
    drawableFiles,
    dtsPath,
    symbolmapPath,
    symbols,
    drawables,
  };
}

// Build all symbol sets. Output goes in a "nanoicons" folder next to each
// inputDir, matching the font pipeline's convention.
export async function buildAllSymbols(
  symbolSets: SymbolSetConfig[],
  projectRoot: string,
  options?: {
    logger?: NanoLogger;
    keepOutputsOnFailure?: boolean;
    preparedSvgCache?: PreparedSvgCache<SymbolTask>;
    svgWorkerPool?: SvgWorkerPool;
  }
): Promise<BuiltSymbolSet[]> {
  const logger = options?.logger;
  const version = packageVersion();
  const toolchain = fontToolchainVersions();
  const results: BuiltSymbolSet[] = [];
  const failures: string[] = [];

  for (let i = 0; i < symbolSets.length; i++) {
    const set = symbolSets[i]!;
    const inputDir = path.resolve(projectRoot, set.inputDir);
    const name = set.name ?? path.basename(inputDir);
    const prefix = set.prefix ?? DEFAULT_PREFIX;

    if (!fs.existsSync(inputDir)) {
      throw new Error(
        `[react-native-nano-icons] Input directory does not exist: ${inputDir} (from "${set.inputDir}")`
      );
    }

    const outputDir = set.outputDir
      ? path.resolve(projectRoot, set.outputDir)
      : path.join(path.dirname(inputDir), 'nanoicons');

    const multicolor = set.multicolor === true;
    const { hash: inputHash, svgHashByFile } = fingerprintSymbolDirSync(
      inputDir,
      {
        prefix,
        multicolor,
        version,
        toolchain,
      }
    );

    const skipped = shouldSkipGeneration(
      inputHash,
      outputDir,
      name,
      multicolor,
      logger
    );
    if (skipped) {
      results.push(skipped);
      continue;
    }

    logger?.start(`Building ${name} (${i + 1}/${symbolSets.length})…`);

    let out;
    try {
      out = await runSymbolPipeline(
        { name, prefix, multicolor },
        { inputDir, outputDir },
        {
          logger,
          inputHash,
          preparedSvgCache: options?.preparedSvgCache,
          svgWorkerPool: options?.svgWorkerPool,
          svgHashByFile,
        }
      );
    } catch (err) {
      if (!options?.keepOutputsOnFailure) removeOutputs(outputDir, name);
      logger?.fail(err instanceof Error ? err.message : String(err));
      failures.push(name);
      continue;
    }

    results.push(out);
  }

  if (failures.length) {
    throw new SymbolSetBuildError(
      `${failures.length} symbol set${
        failures.length === 1 ? '' : 's'
      } failed to build: ${failures.join(', ')}`,
      results
    );
  }

  return results;
}

function removeOutputs(outputDir: string, name: string): void {
  for (const output of [
    `${name}.symbolmap.json`,
    `${name}.symbols.d.ts`,
    `${name}.symbols`,
    `${name}.drawables`,
  ]) {
    fs.rmSync(path.join(outputDir, output), { recursive: true, force: true });
  }
}
