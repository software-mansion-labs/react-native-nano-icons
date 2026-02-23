import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'node:url';
import type { IconSetConfig, BuiltFont } from './types.js';
import { getPackageName, getPackageRootPath } from './packageName.js';

const DEFAULT_SAFE_ZONE = 1020;
const DEFAULT_UPM = 1024;
const DEFAULT_START_UNICODE = 0xe900;

type PipelineModule = {
  runPipeline: (
    config: {
      fontFamily: string;
      upm: number;
      safeZone: number;
      startUnicode: number;
    },
    paths: { inputDir: string; outputDir: string; tempDir: string },
    options?: { silent?: boolean }
  ) => Promise<{ ttfPath: string; glyphmapPath: string }>;
};

/**
 * Load the pipeline as an ESM dynamic import.
 */
async function getPipelineModule(): Promise<PipelineModule> {
  const root = getPackageRootPath();
  const pipelinePath = path.join(
    root,
    'lib',
    'module',
    'core',
    'pipeline',
    'index.js'
  );
  const mod = await import(pathToFileURL(pipelinePath).href);
  return mod as PipelineModule;
}

/**
 * Sanity check: skip font generation if the output folder already has .ttf and .glyphmap.json for this set.
 * In the future this can be extended with fingerprint diffing.
 */
function shouldSkipGeneration(outputDir: string, fontFamily: string): boolean {
  const ttfPath = path.join(outputDir, `${fontFamily}.ttf`);
  const glyphmapPath = path.join(outputDir, `${fontFamily}.glyphmap.json`);
  return (
    fs.existsSync(outputDir) &&
    fs.existsSync(ttfPath) &&
    fs.existsSync(glyphmapPath)
  );
}

/**
 * Build TTF + glyphmap for all icon sets using a single Pyodide/PathKit instance.
 * Output is placed in a "nanoicons" folder next to each input dir (sibling to inputDir).
 * Skips generation for a set if that output folder already contains the expected .ttf and .glyphmap.json.
 */
export async function buildAllFonts(
  iconSets: IconSetConfig[],
  projectRoot: string,
  options?: { silent?: boolean }
): Promise<BuiltFont[]> {
  const pkgName = getPackageName();
  const results: BuiltFont[] = [];
  let pipeline: PipelineModule | null = null;

  for (const set of iconSets) {
    const inputDir = path.resolve(projectRoot, set.inputDir);
    if (!fs.existsSync(inputDir)) {
      throw new Error(
        `[${pkgName}] Input directory does not exist: ${inputDir} (from "${set.inputDir}")`
      );
    }

    const parentDir = path.dirname(inputDir);
    const outputDir = path.join(parentDir, 'nanoicons');
    const ttfPath = path.join(outputDir, `${set.fontFamily}.ttf`);
    const glyphmapPath = path.join(
      outputDir,
      `${set.fontFamily}.glyphmap.json`
    );

    if (shouldSkipGeneration(outputDir, set.fontFamily)) {
      if (!options?.silent) {
        console.log(
          `[${pkgName}] ✅ ${set.fontFamily} already up to date (output exists), skipping.`
        );
      }
      results.push({ fontFamily: set.fontFamily, ttfPath, glyphmapPath });
      continue;
    }

    if (!pipeline) pipeline = await getPipelineModule();
    const tempDir = path.join(projectRoot, '.temp_layers', set.fontFamily);

    const config = {
      fontFamily: set.fontFamily,
      upm: set.upm ?? DEFAULT_UPM,
      safeZone: set.safeZone ?? DEFAULT_SAFE_ZONE,
      startUnicode:
        set.startUnicode !== undefined
          ? typeof set.startUnicode === 'string'
            ? parseInt(String(set.startUnicode), 16)
            : set.startUnicode
          : DEFAULT_START_UNICODE,
    };

    const { runPipeline } = pipeline;
    const out = await runPipeline(
      config,
      { inputDir, outputDir, tempDir },
      options
    );

    results.push({
      fontFamily: set.fontFamily,
      ttfPath: out.ttfPath,
      glyphmapPath: out.glyphmapPath,
    });
  }

  return results;
}
