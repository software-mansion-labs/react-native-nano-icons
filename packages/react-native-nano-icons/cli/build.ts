import path from 'path';
import fs from 'fs';
import { runPipeline } from '../src/core/pipeline/index.js';
import type { NanoLogger } from './logger.js';

export type IconSetConfig = {
  /** Path to folder of SVG files (relative to project root). */
  inputDir: string;
  /** Font family name (used for TTF and glyphmap filenames). */
  fontFamily: string;
  /** Units per em (default 1024). */
  upm?: number;
  /** Safe zone inside UPM for glyphs (default 1020). */
  safeZone?: number;
  /** First Unicode codepoint for glyphs (default 0xe900). Hex string or number. */
  startUnicode?: number | string;
};

export type BuiltFont = {
  fontFamily: string;
  ttfPath: string;
  glyphmapPath: string;
};

const DEFAULT_SAFE_ZONE = 1020;
const DEFAULT_UPM = 1024;
const DEFAULT_START_UNICODE = 0xe900;

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
  options?: { logger?: NanoLogger }
): Promise<BuiltFont[]> {
  const logger = options?.logger;
  const results: BuiltFont[] = [];
  let allSkipped = true;

  for (let i = 0; i < iconSets.length; i++) {
    const set = iconSets[i]!;
    const inputDir = path.resolve(projectRoot, set.inputDir);

    if (!fs.existsSync(inputDir)) {
      throw new Error(
        `[react-native-nano-icons] Input directory does not exist: ${inputDir} (from "${set.inputDir}")`
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
      results.push({ fontFamily: set.fontFamily, ttfPath, glyphmapPath });
      continue;
    }

    allSkipped = false;
    const tempDir = path.join(projectRoot, '.temp_layers', set.fontFamily);

    const config = {
      fontFamily: set.fontFamily,
      upm: set.upm ?? DEFAULT_UPM,
      safeZone: set.safeZone ?? DEFAULT_SAFE_ZONE,
      startUnicode:
        set.startUnicode !== undefined
          ? typeof set.startUnicode === 'string'
            ? parseInt(set.startUnicode, 16)
            : set.startUnicode
          : DEFAULT_START_UNICODE,
    };

    logger?.start(`Building ${set.fontFamily} (${i + 1}/${iconSets.length})…`);

    const out = await runPipeline(
      config,
      { inputDir, outputDir, tempDir },
      { logger }
    );

    results.push({
      fontFamily: set.fontFamily,
      ttfPath: out.ttfPath,
      glyphmapPath: out.glyphmapPath,
    });
  }

  if (allSkipped && results.length > 0) {
    logger?.succeed(
      '🔬 Your icons are flight-tuned with react-native-nano-icons'
    );
  }

  return results;
}
