import fsp from 'node:fs/promises';
import path from 'node:path';

import {
  compileTtfFromGlyphs,
  compileWoff2FromTtf,
  parseCompileTtfFromGlyphsError,
  type FontGlyph,
} from '../font/compile';
import { buildFontFamily } from '../../utils/fontIdentity';
import type { GlyphLayer, NanoGlyphMap, NanoLogger } from '../types';
import { ensureDir, type PipelineConfig, type PipelinePaths } from './config';
import { defaultConcurrency, type SvgWorkerPool } from './iconPool';
import {
  prepareIconsWithCache,
  type PreparedSvgCache,
} from './preparedSvgCache';

export type PipelineResult = {
  ttfPath: string;
  glyphmapPath: string;
  family: string;
  woff2Path?: string;
};

/**
 * Run the font pipeline with given config and paths.
 * Uses the cached PathKit instance (initialized on first call).
 */
export async function runFontPipeline(
  config: PipelineConfig,
  paths: PipelinePaths,
  options?: {
    logger?: NanoLogger;
    inputHash?: string;
    concurrency?: number;
    preparedSvgCache?: PreparedSvgCache;
    svgWorkerPool?: SvgWorkerPool;
    svgHashByFile?: Map<string, string>;
  }
): Promise<PipelineResult> {
  const startTime = Date.now();
  const logger = options?.logger;

  logger?.update(`Building "${config.fontFamily}"…`);

  ensureDir(paths.outputDir);

  const files = (await fsp.readdir(paths.inputDir)).filter((f) =>
    f.toLowerCase().endsWith('.svg')
  );

  const inputHash = options?.inputHash;
  const family = inputHash
    ? buildFontFamily(config.fontFamily, inputHash)
    : config.fontFamily;

  const glyphMap: NanoGlyphMap = {
    m: {
      f: family,
      u: config.upm,
      z: config.safeZone,
      s: config.startUnicode,
      ...(config.linking === 'dynamic' ? { l: 'd' as const } : {}),
      ...(config.web ? { w: true as const } : {}),
    },
    i: {},
  };

  let currentUnicode = config.startUnicode;
  const codepointToIcon = new Map<number, string>();
  const allGlyphs: FontGlyph[] = [];

  const failed: string[] = [];

  const results = await prepareIconsWithCache(
    files.map((file) => ({
      file,
      filePath: path.join(paths.inputDir, file),
      fontFamily: config.fontFamily,
      upm: config.upm,
      safeZone: config.safeZone,
    })),
    options?.concurrency ?? defaultConcurrency(),
    options?.preparedSvgCache,
    options?.svgWorkerPool,
    options?.svgHashByFile
  );

  for (const result of results) {
    for (const [level, msg] of result.logs) logger?.[level](msg);
    if (result.error !== null) {
      logger?.fail(result.error);
      failed.push(result.file);
      continue;
    }

    const layers: GlyphLayer[] = [];
    for (const layer of result.layers) {
      const cp = currentUnicode++;
      codepointToIcon.set(cp, result.iconName);
      allGlyphs.push({
        codepoint: cp,
        advanceWidth: result.adv,
        d: layer.d,
      });
      layers.push([cp, layer.fill || 'black']);
    }
    if (layers.length > 0) {
      glyphMap.i[result.iconName] = [result.adv, layers];
    }
  }

  if (failed.length) {
    throw new Error(
      `${failed.length} of ${files.length} icons in [${config.fontFamily}] could not be converted: ${failed.join(', ')}`
    );
  }

  logger?.info(`Compiling TTF…`);
  const ttfPath = path.join(paths.outputDir, `${config.fontFamily}.ttf`);

  let ttfBuffer: Buffer | undefined;
  try {
    ttfBuffer = await compileTtfFromGlyphs({
      glyphs: allGlyphs,
      outTtfPath: ttfPath,
      fontName: family,
      upm: config.upm,
      ascent: config.upm,
      descent: 0,
    });
  } catch (err: unknown) {
    parseCompileTtfFromGlyphsError(err, codepointToIcon);
  }

  let woff2Path: string | undefined;
  if (config.web && ttfBuffer) {
    logger?.info(`Compiling WOFF2…`);
    woff2Path = path.join(paths.outputDir, `${config.fontFamily}.woff2`);
    await fsp.writeFile(woff2Path, await compileWoff2FromTtf(ttfBuffer));
  }

  const glyphmapPath = path.join(
    paths.outputDir,
    `${config.fontFamily}.glyphmap.json`
  );

  if (inputHash) {
    glyphMap.m.h = inputHash;
  }
  await fsp.writeFile(glyphmapPath, JSON.stringify(glyphMap), 'utf8');

  const iconCount = Object.keys(glyphMap.i).length;
  const elapsed = Date.now() - startTime;
  const products = woff2Path
    ? `${config.fontFamily}.ttf + ${config.fontFamily}.woff2`
    : `${config.fontFamily}.ttf`;
  logger?.succeed(
    `Built ${products} [${iconCount} icon${
      iconCount === 1 ? '' : 's'
    } in ${elapsed}ms]`
  );

  return { ttfPath, glyphmapPath, family, woff2Path };
}
