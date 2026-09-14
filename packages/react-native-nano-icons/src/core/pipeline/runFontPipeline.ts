import fsp from 'node:fs/promises';
import path from 'node:path';

import {
  compileTtfFromGlyphs,
  parseCompileTtfFromGlyphsError,
  type FontGlyph,
} from '../font/compile';
import type { GlyphLayer, NanoGlyphMap, NanoLogger } from '../types';
import { ensureDir, type PipelineConfig, type PipelinePaths } from './config';
import { defaultConcurrency, prepareIcons } from './iconPool';

export type PipelineResult = {
  ttfPath: string;
  glyphmapPath: string;
};

/**
 * Run the font pipeline with given config and paths.
 * Uses the cached PathKit instance (initialized on first call).
 */
export async function runFontPipeline(
  config: PipelineConfig,
  paths: PipelinePaths,
  options?: { logger?: NanoLogger; inputHash?: string; concurrency?: number }
): Promise<PipelineResult> {
  const startTime = Date.now();
  const logger = options?.logger;

  logger?.update(`Building "${config.fontFamily}"…`);

  ensureDir(paths.outputDir);

  const files = (await fsp.readdir(paths.inputDir)).filter((f) =>
    f.toLowerCase().endsWith('.svg')
  );

  const glyphMap: NanoGlyphMap = {
    m: {
      f: config.fontFamily,
      u: config.upm,
      z: config.safeZone,
      s: config.startUnicode,
      ...(config.linking === 'dynamic' ? { l: 'd' as const } : {}),
    },
    i: {},
  };

  let currentUnicode = config.startUnicode;
  const codepointToIcon = new Map<number, string>();
  const allGlyphs: FontGlyph[] = [];

  const failed: string[] = [];

  const results = await prepareIcons(
    files.map((file) => ({
      file,
      filePath: path.join(paths.inputDir, file),
      fontFamily: config.fontFamily,
      upm: config.upm,
      safeZone: config.safeZone,
    })),
    options?.concurrency ?? defaultConcurrency()
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

  const glyphmapPath = path.join(
    paths.outputDir,
    `${config.fontFamily}.glyphmap.json`
  );

  if (options?.inputHash) {
    glyphMap.m.h = options.inputHash;
  }
  await fsp.writeFile(glyphmapPath, JSON.stringify(glyphMap), 'utf8');

  logger?.info(`Compiling TTF…`);
  const ttfPath = path.join(paths.outputDir, `${config.fontFamily}.ttf`);

  try {
    await compileTtfFromGlyphs({
      glyphs: allGlyphs,
      outTtfPath: ttfPath,
      fontName: config.fontFamily,
      upm: config.upm,
      ascent: config.upm,
      descent: 0,
    });
  } catch (err: unknown) {
    parseCompileTtfFromGlyphsError(err, codepointToIcon);
  }

  const iconCount = Object.keys(glyphMap.i).length;
  const elapsed = Date.now() - startTime;
  logger?.succeed(
    `Built ${config.fontFamily}.ttf [${iconCount} icon${
      iconCount === 1 ? '' : 's'
    } in ${elapsed}ms]`
  );

  return { ttfPath, glyphmapPath };
}
