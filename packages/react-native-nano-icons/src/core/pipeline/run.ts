import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { compileTtfFromGlyphSVGs } from '../font/compile.js';
import { picoFromFile } from './managers.js';

import {
  ensureDir,
  ensureEmptyDir,
  type PipelineConfig,
  type PipelinePaths,
} from './config.js';
import {
  parseFlattenedSvg,
  preprocessSvg,
  shouldSkipPath,
  validateSvg,
} from '../svg/svg_dom.js';
import { computePlacement, writeLayerSvg } from '../svg/layers.js';
import type { GlyphEntry, NanoGlyphMap } from '../types.js';
import type { NanoLogger } from '../types.js';

export type PipelineResult = {
  ttfPath: string;
  glyphmapPath: string;
};

/**
 * Run the font pipeline with given config and paths.
 * Uses the singleton Pyodide/PathKit instance (initialized on first call).
 */
export async function runPipeline(
  config: PipelineConfig,
  paths: PipelinePaths,
  options?: { logger?: NanoLogger }
): Promise<PipelineResult> {
  const startTime = Date.now();
  const logger = options?.logger;

  logger?.update(`Building "${config.fontFamily}"…`);

  ensureEmptyDir(paths.tempDir);
  ensureDir(paths.outputDir);

  const files = (await fsp.readdir(paths.inputDir)).filter((f) =>
    f.toLowerCase().endsWith('.svg')
  );

  const glyphMap: NanoGlyphMap = {
    meta: {
      fontFamily: config.fontFamily,
      upm: config.upm,
      safeZone: config.safeZone,
      startUnicode: config.startUnicode,
    },
    icons: {},
  };

  let currentUnicode = config.startUnicode;

  for (const file of files) {
    const iconName = path.parse(file).name;
    const filePath = path.join(paths.inputDir, file);

    logger?.info(`Processing ${file}`);

    const rawContent = await fsp.readFile(filePath, 'utf-8');

    const validation = validateSvg(rawContent);
    if (validation.valid === false) {
      logger?.warn(
        `Skipping "${config.fontFamily}:${file}": ${validation.reason}`
      );
      continue;
    }

    const preprocessed = preprocessSvg(rawContent);
    const flattenedSvg = await picoFromFile(filePath, preprocessed);
    const parsed = parseFlattenedSvg(flattenedSvg);

    const { vx, vy, scale, xOff, yOff, adv } = computePlacement({
      upm: config.upm,
      safeZone: config.safeZone,
      viewBox: parsed.viewBox,
    });

    const entry: GlyphEntry = { adv, layers: [] };

    for (const p of parsed.paths) {
      if (shouldSkipPath(p.d, p.fill)) continue;

      const cp = currentUnicode++;

      await writeLayerSvg({
        tempDir: paths.tempDir,
        upm: config.upm,
        adv,
        vx,
        vy,
        scale,
        xOff,
        yOff,
        d: p.d,
        codepoint: cp,
      });

      entry.layers.push({ codepoint: cp, color: p.fill || 'black' });
    }

    if (entry.layers.length > 0) {
      glyphMap.icons[iconName] = entry;
    }
  }

  const glyphmapPath = path.join(
    paths.outputDir,
    `${config.fontFamily}.glyphmap.json`
  );

  await fsp.writeFile(glyphmapPath, JSON.stringify(glyphMap, null, 2), 'utf8');

  logger?.info(`Compiling TTF…`);
  const ttfPath = path.join(paths.outputDir, `${config.fontFamily}.ttf`);

  await compileTtfFromGlyphSVGs({
    glyphDir: paths.tempDir,
    outTtfPath: ttfPath,
    fontName: config.fontFamily,
    upm: config.upm,
    ascent: config.upm,
    descent: 0,
  });

  if (fs.existsSync(paths.tempDir)) {
    fs.rmSync(paths.tempDir, { recursive: true, force: true });
  }

  const iconCount = Object.keys(glyphMap.icons).length;
  const elapsed = Date.now() - startTime;
  logger?.succeed(
    `Built ${config.fontFamily}.ttf [${iconCount} icon${
      iconCount === 1 ? '' : 's'
    } in ${elapsed}ms]`
  );

  return { ttfPath, glyphmapPath };
}
