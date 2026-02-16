// src/core/pipeline/run.ts
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { picoFromFile } from "../index.js";
import { compileTtfFromGlyphSvgs } from "../font/compile.js";

import {
  ensureDir,
  ensureEmptyDir,
  readCliConfigAndPaths,
  type PipelineConfig,
  type PipelinePaths,
} from "./config.js";
import { parseFlattenedSvg, shouldSkipPath } from "./svg_dom.js";
import { computePlacement, writeLayerSvg, type GlyphMap } from "./layers.js";

export type PipelineResult = {
  ttfPath: string;
  glyphmapPath: string;
};

/**
 * Run the font pipeline with given config and paths.
 * Uses the singleton Pyodide/PathKit instance (initialized on first call).
 * Use this from the Expo plugin to build multiple icon sets without reinitializing WASM.
 */
export async function runPipeline(
  config: PipelineConfig,
  paths: PipelinePaths,
  options?: { silent?: boolean },
): Promise<PipelineResult> {
  const log = options?.silent ? () => {} : (msg: string) => console.log(msg);

  log(
    `🚀 Building font "${config.fontFamily}" from ${paths.inputDir} (PathKit+Pyodide picosvg)...`,
  );

  ensureEmptyDir(paths.tempDir);
  ensureDir(paths.outputDir); // do not wipe: multiple icon sets share the same output dir

  const files = (await fsp.readdir(paths.inputDir)).filter((f) =>
    f.toLowerCase().endsWith(".svg"),
  );

  const glyphMap: GlyphMap = {};
  let currentUnicode = config.startUnicode;

  for (const file of files) {
    const iconName = path.parse(file).name;
    const filePath = path.join(paths.inputDir, file);

    const flattenedSvg = await picoFromFile(filePath);
    const parsed = parseFlattenedSvg(flattenedSvg);

    const { vx, vy, scale, xOff, yOff } = computePlacement({
      upm: config.upm,
      safeZone: config.safeZone,
      viewBox: parsed.viewBox,
    });

    glyphMap[iconName] = [];

    for (const p of parsed.paths) {
      if (shouldSkipPath(p.d, p.fill)) continue;

      const { hex } = await writeLayerSvg({
        tempDir: paths.tempDir,
        upm: config.upm,
        vx,
        vy,
        scale,
        xOff,
        yOff,
        d: p.d,
        codepoint: currentUnicode,
      });

      glyphMap[iconName].push({ hex: `\\u${hex}`, color: p.fill || "black" });
      currentUnicode++;
    }
  }

  const glyphmapPath = path.join(
    paths.outputDir,
    `${config.fontFamily}.glyphmap.json`,
  );
  await fsp.writeFile(
    glyphmapPath,
    JSON.stringify(glyphMap, null, 2),
    "utf8",
  );

  log("🎨 Compiling TTF with svgicons2svgfont + svg2ttf (Node)...");
  const ttfPath = path.join(paths.outputDir, `${config.fontFamily}.ttf`);

  await compileTtfFromGlyphSvgs({
    glyphDir: paths.tempDir,
    outTtfPath: ttfPath,
    fontName: config.fontFamily,
    upm: config.upm,
    ascent: config.upm,
    descent: 0,
  });

  if (fs.existsSync(paths.tempDir))
    fs.rmSync(paths.tempDir, { recursive: true, force: true });

  if (!options?.silent) {
    log(`✅ Build Complete!\n   - Font: ${ttfPath}\n   - Map:  ${glyphmapPath}`);
  }

  return { ttfPath, glyphmapPath };
}

export async function runFromCli(): Promise<void> {
  const { config, paths } = readCliConfigAndPaths();
  await runPipeline(config, paths);
}
