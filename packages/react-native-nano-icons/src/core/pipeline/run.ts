import fsp from 'node:fs/promises';
import path from 'node:path';

import {
  compileTtfFromGlyphs,
  parseCompileTtfFromGlyphsError,
  type FontGlyph,
} from '../font/compile.js';
import { picoFromFile, PathKitManager } from './managers.js';

import {
  ensureDir,
  type PipelineConfig,
  type PipelinePaths,
} from './config.js';
import {
  parseFlattenedSvg,
  preprocessSvg,
  shouldSkipPath,
  validateSvg,
  extractOriginalEvenoddDs,
  restoreOriginalEvenoddDs,
} from '../svg/svg_dom.js';
import { computePlacement, transformPathForFont } from '../svg/layers.js';
import { convertEvenoddToWinding } from '../svg/svg_pathops.js';
import type {
  GlyphLayer,
  NanoGlyphMap,
} from '../types.js';
import type { NanoLogger } from '../types.js';

export type PipelineResult = {
  ttfPath: string;
  glyphmapPath: string;
};

// ---------------------------------------------------------------------------
// Same-color path merging
// ---------------------------------------------------------------------------

type ParsedPath = { d: string; fill: string | null; fillRule?: 'evenodd'; noMerge?: boolean };

/**
 * Concatenate multiple SVG path `d` strings into a single compound path.
 * This preserves the exact geometry of each path (no boolean operations)
 * while combining them into one glyph. Under nonzero winding, this renders
 * identically to drawing each path separately with the same color.
 */
function concatPathDs(ds: string[]): string | null {
  if (ds.length === 0) return null;
  if (ds.length === 1) return ds[0]!;
  return ds.join(' ');
}

/**
 * Merge consecutive same-color paths into single compound paths via boolean UNION.
 * Preserves z-order: only merges runs of adjacent paths with identical fill color.
 */
function mergeSameColorPaths(
  paths: ParsedPath[],
  logger?: NanoLogger
): ParsedPath[] {
  if (paths.length <= 1) return paths;

  const result: ParsedPath[] = [];
  let i = 0;

  while (i < paths.length) {
    const fill = paths[i]!.fill;

    // Find consecutive run of same fill that are all mergeable.
    // Paths converted from evenodd have compound hole structure and must not
    // be merged — their CW hole contours would cancel CCW contours from
    // adjacent paths, producing incorrect fill.
    let j = i + 1;
    if (!paths[i]!.noMerge) {
      while (
        j < paths.length &&
        paths[j]!.fill === fill &&
        !paths[j]!.noMerge
      ) {
        j++;
      }
    }

    if (j - i === 1) {
      result.push(paths[i]!);
    } else {
      const group = paths.slice(i, j);
      const merged = concatPathDs(group.map((p) => p.d));
      if (merged) {
        logger?.info(
          `    ⊕ Merged ${group.length} same-color paths (fill=${fill})`
        );
        result.push({ d: merged, fill });
      } else {
        result.push(...group);
      }
    }
    i = j;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the font pipeline with given config and paths.
 * Uses the singleton Pyodide/PathKit instance (initialized on first call).
 */
export async function runPipeline(
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
    },
    i: {},
  };

  let currentUnicode = config.startUnicode;
  const codepointToIcon = new Map<number, string>();
  const allGlyphs: FontGlyph[] = [];

  const PathKit = await PathKitManager.getInstance();

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

    // Preserve original evenodd `d` strings BEFORE picosvg processes them.
    // Picosvg's simplify (via our PathKit shim) can drop contours from
    // multi-subpath evenodd paths — we restore the originals after.
    const originalEvenoddDs = extractOriginalEvenoddDs(preprocessed);

    const flattenedSvg = await picoFromFile(filePath, preprocessed);
    const parsed = parseFlattenedSvg(flattenedSvg, {
      onSanitize: (original) => {
        logger?.info(
          `  ⚠ Sanitized path in "${file}": path was missing initial moveto (prepended M from endpoint)`
        );
        logger?.info(`    Original: ${original.slice(0, 80)}…`);
      },
    });

    // Restore original evenodd path data (undamaged by picosvg's simplify),
    // then convert to nonzero winding with our containment-based algorithm.
    // Mark as noMerge — compound paths with holes must stay separate so their
    // CW hole contours don't cancel adjacent paths' CCW contours.
    if (originalEvenoddDs.length > 0) {
      restoreOriginalEvenoddDs(parsed.paths, originalEvenoddDs);
    }
    for (const p of parsed.paths) {
      if (p.fillRule === 'evenodd') {
        logger?.info(`  ↻ Converting evenodd path to nonzero winding in "${file}"`);
        p.d = convertEvenoddToWinding(PathKit, p.d);
        delete p.fillRule;
        (p as ParsedPath).noMerge = true;
      }
    }

    // Merge consecutive same-color paths into single compound glyphs
    const mergedPaths = mergeSameColorPaths(parsed.paths, logger);

    const { vx, vy, scale, xOff, yOff, adv } = computePlacement({
      upm: config.upm,
      safeZone: config.safeZone,
      viewBox: parsed.viewBox,
    });

    const layers: GlyphLayer[] = [];

    for (const p of mergedPaths) {
      if (shouldSkipPath(p.d, p.fill)) continue;

      const cp = currentUnicode++;
      codepointToIcon.set(cp, iconName);

      const fontD = transformPathForFont(PathKit, p.d, {
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
