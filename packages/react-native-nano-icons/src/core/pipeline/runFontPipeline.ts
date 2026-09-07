import fsp from 'node:fs/promises';
import path from 'node:path';

import {
  compileTtfFromGlyphs,
  parseCompileTtfFromGlyphsError,
  type FontGlyph,
} from '../font/compile';
import { shouldSkipPath } from '../glyph/parse';
import { computePlacement, transformPathForFont } from '../glyph/placement';
import { loadPathKit } from '../pathkit/load';
import type { GlyphLayer, NanoGlyphMap, NanoLogger } from '../types';
import { ensureDir, type PipelineConfig, type PipelinePaths } from './config';
import { prepareSvgLayers } from './prepare';

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
  options?: { logger?: NanoLogger; inputHash?: string }
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

  const pathkit = await loadPathKit();

  for (const file of files) {
    const iconName = path.parse(file).name;
    const filePath = path.join(paths.inputDir, file);

    logger?.info(`Processing ${file}`);

    const prepared = await prepareSvgLayers({
      filePath,
      fileLabel: `${config.fontFamily}:${file}`,
      pathkit,
      logger,
    });
    if (!prepared) continue;

    const { vx, vy, scale, xOff, yOff, adv } = computePlacement({
      upm: config.upm,
      safeZone: config.safeZone,
      viewBox: prepared.viewBox,
    });

    const layers: GlyphLayer[] = [];

    for (const p of prepared.paths) {
      if (shouldSkipPath(p.d, p.fill)) continue;

      const cp = currentUnicode++;
      codepointToIcon.set(cp, iconName);

      const fontD = transformPathForFont(pathkit, p.d, {
        vx,
        vy,
        scale,
        xOff,
        yOff,
        upm: config.upm,
      });

      allGlyphs.push({
        codepoint: cp,
        advanceWidth: adv,
        d: fontD,
      });

      layers.push([cp, p.fill || 'black']);
    }

    if (layers.length > 0) {
      glyphMap.i[iconName] = [adv, layers];
    }
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
