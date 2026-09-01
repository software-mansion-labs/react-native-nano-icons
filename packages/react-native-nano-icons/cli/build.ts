import path from 'path';
import fs from 'fs';
import { runPipeline } from '../src/core/pipeline/index.js';
import type { NanoLogger } from './logger.js';
import { getFingerprintSync } from '../src/utils/fingerPrint.js';

export type IconSetConfig = {
  /** Path to folder of SVG files (relative to project root). */
  inputDir: string;
  /** Font family name (used for TTF and glyphmap filenames). */
  fontFamily?: string;
  /** Path where .ttf and .glyphmap.json will be saved. Defaults to a sibling nanoicons folder relative to inputDir. */
  outputDir?: string;
  /** Units per em (default 1024). */
  upm?: number;
  /** Safe zone inside UPM for glyphs (default 1020). */
  safeZone?: number;
  /** First Unicode codepoint for glyphs (default 0xe900). Hex string or number. */
  startUnicode?: number | string;
  /** Linking type for the font (default 'static'). Static bundles the TTF, dynamic delivers it via OTA*/
  linking?: 'static' | 'dynamic';
};

export type BuiltFont = {
  fontFamily: string;
  ttfPath: string;
  glyphmapPath: string;
  linking: 'static' | 'dynamic';
};

const DEFAULT_SAFE_ZONE = 1020;
const DEFAULT_UPM = 1024;
const DEFAULT_START_UNICODE = 0xe900;

function shouldSkipGeneration(
  inputHash: string,
  outputDir: string,
  fontFamily: string,
  linking: 'static' | 'dynamic',
  logger?: NanoLogger
): boolean {
  const ttfPath = path.join(outputDir, `${fontFamily}.ttf`);
  const glyphmapPath = path.join(outputDir, `${fontFamily}.glyphmap.json`);

  if (
    !fs.existsSync(outputDir) ||
    !fs.existsSync(ttfPath) ||
    !fs.existsSync(glyphmapPath)
  ) {
    return false;
  }

  const glyphmap = JSON.parse(fs.readFileSync(glyphmapPath, 'utf8'));
  const storedHash: string | undefined = glyphmap?.m?.h;
  const storedLinking: 'static' | 'dynamic' =
    glyphmap?.m?.l === 'd' ? 'dynamic' : 'static';

  if (storedHash && storedHash === inputHash && storedLinking === linking) {
    logger?.info(`${fontFamily}: SVG fingerprint unchanged, skipping build.`);
    return true;
  }

  return false;
}

/**
 * Build TTF + glyphmap for every icon set, reusing one Pyodide/PathKit instance.
 * Outputs land in a sibling "nanoicons" folder and are skipped when the SVGs
 * haven't changed.
 *
 * `resolveRoot` is the base for each set's relative paths (defaults to
 * `projectRoot`); pass the config's folder so a relocated config stays portable.
 */
export async function buildAllFonts(
  iconSets: IconSetConfig[],
  projectRoot: string,
  options?: { logger?: NanoLogger; resolveRoot?: string }
): Promise<BuiltFont[]> {
  const logger = options?.logger;
  const resolveRoot = options?.resolveRoot ?? projectRoot;
  const results: BuiltFont[] = [];
  let allSkipped = true;

  for (let i = 0; i < iconSets.length; i++) {
    const set = iconSets[i]!;
    const inputDir = path.resolve(resolveRoot, set.inputDir);
    const fontFamily = set.fontFamily ?? path.basename(inputDir);
    const linking: 'static' | 'dynamic' = set.linking ?? 'static';

    if (!fs.existsSync(inputDir)) {
      throw new Error(
        `[react-native-nano-icons] Input directory does not exist: ${inputDir} (from "${set.inputDir}")`
      );
    }

    const outputDir = set.outputDir
      ? path.resolve(resolveRoot, set.outputDir)
      : path.join(path.dirname(inputDir), 'nanoicons');
    const ttfPath = path.join(outputDir, `${fontFamily}.ttf`);
    const glyphmapPath = path.join(outputDir, `${fontFamily}.glyphmap.json`);

    const inputHash = getFingerprintSync(inputDir);

    if (
      shouldSkipGeneration(inputHash, outputDir, fontFamily, linking, logger)
    ) {
      results.push({ fontFamily, ttfPath, glyphmapPath, linking });
      continue;
    }

    if (fs.existsSync(ttfPath)) fs.unlinkSync(ttfPath);
    if (fs.existsSync(glyphmapPath)) fs.unlinkSync(glyphmapPath);

    allSkipped = false;
    const tempDir = path.join(projectRoot, '.temp_layers', fontFamily);

    const config = {
      fontFamily,
      upm: set.upm ?? DEFAULT_UPM,
      safeZone: set.safeZone ?? DEFAULT_SAFE_ZONE,
      startUnicode:
        set.startUnicode !== undefined
          ? typeof set.startUnicode === 'string'
            ? parseInt(set.startUnicode, 16)
            : set.startUnicode
          : DEFAULT_START_UNICODE,
      linking,
    };

    logger?.start(`Building ${fontFamily} (${i + 1}/${iconSets.length})…`);

    const out = await runPipeline(
      config,
      { inputDir, outputDir, tempDir },
      { logger, inputHash }
    );

    results.push({
      fontFamily,
      ttfPath: out.ttfPath,
      glyphmapPath: out.glyphmapPath,
      linking,
    });
  }

  if (allSkipped && results.length > 0) {
    logger?.succeed('Your icons are flight-tuned with react-native-nano-icons');
  }

  return results;
}
