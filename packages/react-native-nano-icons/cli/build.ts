import path from 'path';
import fs from 'fs';
import { runFontPipeline } from '../src/core/pipeline/index';
import type { NanoLogger } from './logger';
import { getFingerprintSync } from '../src/utils/fingerPrint';
import {
  fontToolchainVersions,
  packageVersion,
} from '../src/utils/packageVersion';

export type IconSetConfig = {
  /** Path to folder of SVG files (relative to project root). */
  inputDir: string;
  /** Font family name (used for TTF and glyphmap filenames). */
  fontFamily?: string;
  /** Path where .ttf and .glyphmap.json will be saved. Defaults to a sibling nanoicons folder relative to inputDir. */
  outputDir?: string;
  /** Units per em (default 1024). */
  upm?: number;
  /** Safe zone inside UPM for glyphs (default upm * 1020 / 1024, i.e. 1020 at the default upm). Must not exceed upm. */
  safeZone?: number;
  /** First Unicode codepoint for glyphs (default 0xe900). Hex string or number. */
  startUnicode?: number | string;
  /** Linking type for the font (default 'static'). Static bundles the TTF, dynamic delivers it via OTA*/
  linking?: 'static' | 'dynamic';
  /** Also emit <fontFamily>.woff2 into outputDir for web (default false). Rebuilt with the TTF, never linked natively. */
  web?: boolean;
};

export type BuiltFont = {
  fontFamily: string;
  family: string;
  ttfPath: string;
  glyphmapPath: string;
  linking: 'static' | 'dynamic';
  woff2Path?: string;
};

export class IconSetBuildError extends Error {
  built: BuiltFont[];

  constructor(message: string, built: BuiltFont[]) {
    super(message);
    this.built = built;
  }
}

const DEFAULT_SAFE_ZONE_RATIO = 1020 / 1024;
const DEFAULT_UPM = 1024;
const DEFAULT_START_UNICODE = 0xe900;

function familyOfCurrentOutput(
  inputHash: string,
  outputDir: string,
  fontFamily: string,
  linking: 'static' | 'dynamic',
  web: boolean,
  logger?: NanoLogger
): string | undefined {
  const ttfPath = path.join(outputDir, `${fontFamily}.ttf`);
  const glyphmapPath = path.join(outputDir, `${fontFamily}.glyphmap.json`);
  const woff2Path = path.join(outputDir, `${fontFamily}.woff2`);

  if (
    !fs.existsSync(outputDir) ||
    !fs.existsSync(ttfPath) ||
    !fs.existsSync(glyphmapPath) ||
    (web && !fs.existsSync(woff2Path))
  ) {
    return undefined;
  }

  const glyphmap = JSON.parse(fs.readFileSync(glyphmapPath, 'utf8'));
  const storedHash: string | undefined = glyphmap?.m?.h;
  const storedFamily: string | undefined = glyphmap?.m?.f;
  const storedLinking: 'static' | 'dynamic' =
    glyphmap?.m?.l === 'd' ? 'dynamic' : 'static';
  const storedWeb = glyphmap?.m?.w === true;

  if (
    storedHash &&
    storedFamily &&
    storedHash === inputHash &&
    storedLinking === linking &&
    storedWeb === web
  ) {
    const iconCount = Object.keys(glyphmap?.i ?? {}).length;
    logger?.succeed(
      `${fontFamily}.ttf is up to date [${iconCount} icon${
        iconCount === 1 ? '' : 's'
      }]`
    );
    return storedFamily;
  }

  return undefined;
}

/**
 * Build TTF + glyphmap for all icon sets using a single PathKit instance.
 * Output is placed in a "nanoicons" folder next to each input dir (sibling to inputDir).
 * Skips generation for a set if that output folder already contains the expected .ttf and .glyphmap.json.
 */
export async function buildAllFonts(
  iconSets: IconSetConfig[],
  projectRoot: string,
  options?: { logger?: NanoLogger }
): Promise<BuiltFont[]> {
  const logger = options?.logger;
  const version = packageVersion();
  const toolchain = fontToolchainVersions();
  const results: BuiltFont[] = [];
  const failures: string[] = [];
  let allSkipped = true;

  for (let i = 0; i < iconSets.length; i++) {
    const set = iconSets[i]!;
    const inputDir = path.resolve(projectRoot, set.inputDir);
    const fontFamily = set.fontFamily ?? path.basename(inputDir);
    const linking: 'static' | 'dynamic' = set.linking ?? 'static';
    const web = set.web ?? false;

    if (!fs.existsSync(inputDir)) {
      throw new Error(
        `[react-native-nano-icons] Input directory does not exist: ${inputDir} (from "${set.inputDir}")`
      );
    }

    const upm = set.upm ?? DEFAULT_UPM;
    const safeZone = set.safeZone ?? Math.round(upm * DEFAULT_SAFE_ZONE_RATIO);
    if (safeZone > upm) {
      throw new Error(
        `[react-native-nano-icons] safeZone (${safeZone}) of "${fontFamily}" must not exceed upm (${upm}).`
      );
    }

    const outputDir = set.outputDir
      ? path.resolve(projectRoot, set.outputDir)
      : path.join(path.dirname(inputDir), 'nanoicons');
    const ttfPath = path.join(outputDir, `${fontFamily}.ttf`);
    const glyphmapPath = path.join(outputDir, `${fontFamily}.glyphmap.json`);
    const woff2Path = path.join(outputDir, `${fontFamily}.woff2`);

    const config = {
      fontFamily,
      upm,
      safeZone,
      startUnicode:
        set.startUnicode !== undefined
          ? typeof set.startUnicode === 'string'
            ? parseInt(set.startUnicode, 16)
            : set.startUnicode
          : DEFAULT_START_UNICODE,
      linking,
      web,
    };

    const inputHash = getFingerprintSync(inputDir, {
      upm: config.upm,
      safeZone: config.safeZone,
      startUnicode: config.startUnicode,
      version,
      toolchain,
    });

    const currentFamily = familyOfCurrentOutput(
      inputHash,
      outputDir,
      fontFamily,
      linking,
      web,
      logger
    );
    if (currentFamily) {
      results.push({
        fontFamily,
        family: currentFamily,
        ttfPath,
        glyphmapPath,
        linking,
        ...(web ? { woff2Path } : {}),
      });
      continue;
    }

    allSkipped = false;
    const tempDir = path.join(projectRoot, '.temp_layers', fontFamily);

    logger?.start(`Building ${fontFamily} (${i + 1}/${iconSets.length})…`);

    if (!web && fs.existsSync(woff2Path)) fs.unlinkSync(woff2Path);

    let out;
    try {
      out = await runFontPipeline(
        config,
        { inputDir, outputDir, tempDir },
        { logger, inputHash }
      );
    } catch (err) {
      if (fs.existsSync(ttfPath)) fs.unlinkSync(ttfPath);
      if (fs.existsSync(glyphmapPath)) fs.unlinkSync(glyphmapPath);
      if (fs.existsSync(woff2Path)) fs.unlinkSync(woff2Path);
      logger?.fail(err instanceof Error ? err.message : String(err));
      failures.push(fontFamily);
      continue;
    }

    results.push({
      fontFamily,
      family: out.family,
      ttfPath: out.ttfPath,
      glyphmapPath: out.glyphmapPath,
      linking,
      ...(out.woff2Path ? { woff2Path: out.woff2Path } : {}),
    });
  }

  if (failures.length) {
    throw new IconSetBuildError(
      `${failures.length} icon set${
        failures.length === 1 ? '' : 's'
      } failed to build: ${failures.join(', ')}`,
      results
    );
  }

  if (allSkipped && results.length > 0) {
    logger?.succeed('Your icons are flight-tuned with react-native-nano-icons');
  }

  return results;
}
