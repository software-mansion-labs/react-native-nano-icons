import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { picoFromFile } from '../index.js';
import { compileTtfFromGlyphSVGs } from '../font/compile.js';

import {
  ensureDir,
  ensureEmptyDir,
  readCliConfigAndPaths,
  type PipelineConfig,
  type PipelinePaths,
} from './config.js';
import { parseFlattenedSvg, shouldSkipPath } from '../svg/svg_dom.js';
import { computePlacement, writeLayerSvg } from '../svg/layers.js';
import type { GlyphEntry, NanoGlyphMap } from '../types.js';

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
  options?: { silent?: boolean }
): Promise<PipelineResult> {
  const log = options?.silent ? () => {} : (msg: string) => console.log(msg);

  log(
    `🚀 Building font "${config.fontFamily}" from ${paths.inputDir} (PathKit+Pyodide picosvg)...`
  );

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

    const flattenedSvg = await picoFromFile(filePath);
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

  log('🎨➡️✒️ 🔨 Compiling TTF with svgicons2svgfont + svg2ttf (Node)...');
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

  if (!options?.silent) {
    log(
      `🎨➡️✒️ ✅ ${config.fontFamily} Build Complete!\n   - Font: ${ttfPath}\n   - Map:  ${glyphmapPath}`
    );
  }

  return { ttfPath, glyphmapPath };
}

export async function runFromCli(): Promise<void> {
  const { config, paths } = readCliConfigAndPaths();
  await runPipeline(config, paths);
}
