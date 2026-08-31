import fsp from 'node:fs/promises';

import { picoFromFile } from './managers.js';
import {
  parseFlattenedSvg,
  preprocessSvg,
  validateSvg,
  extractOriginalEvenoddDs,
  restoreOriginalEvenoddDs,
} from '../svg/svg_dom.js';
import { convertEvenoddToWinding } from '../svg/svg_pathops.js';
import type { NanoLogger, PathKitModule } from '../types.js';

export type ParsedPath = {
  d: string;
  fill: string | null;
  fillRule?: 'evenodd';
  noMerge?: boolean;
};

// Concatenate `d` strings into one compound path. Under nonzero winding this
// renders identically to drawing them separately in the same color.
function concatPathDs(ds: string[]): string | null {
  if (ds.length === 0) return null;
  if (ds.length === 1) return ds[0]!;
  return ds.join(' ');
}

// Merge runs of adjacent same-fill paths into compound paths, preserving z-order.
export function mergeSameColorPaths(
  paths: ParsedPath[],
  logger?: NanoLogger
): ParsedPath[] {
  if (paths.length <= 1) return paths;

  const result: ParsedPath[] = [];
  let i = 0;

  while (i < paths.length) {
    const fill = paths[i]!.fill;

    // Find a mergeable run of same fill. evenodd-converted paths are noMerge:
    // their CW hole contours would cancel adjacent CCW contours.
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

export type PreparedSvg = {
  viewBox: [number, number, number, number];
  /** Z-ordered, same-color-merged, nonzero-winding layers. */
  paths: ParsedPath[];
};

/**
 * Shared per-file SVG prep: validate → preprocess → picosvg flatten → parse →
 * evenodd restore/convert → same-color merge. Returns null for unsupported SVGs.
 */
export async function prepareSvgLayers(opts: {
  filePath: string;
  /** Label used in log messages, e.g. `"MyIcons:heart.svg"`. */
  fileLabel: string;
  PathKit: PathKitModule;
  logger?: NanoLogger;
}): Promise<PreparedSvg | null> {
  const { filePath, fileLabel, PathKit, logger } = opts;

  const rawContent = await fsp.readFile(filePath, 'utf-8');

  const validation = validateSvg(rawContent);
  if (validation.valid === false) {
    logger?.warn(`Skipping "${fileLabel}": ${validation.reason}`);
    return null;
  }

  const preprocessed = preprocessSvg(rawContent);

  // Save evenodd `d` strings before picosvg: its simplify can drop contours from
  // multi-subpath evenodd paths, so we restore them after.
  const originalEvenoddDs = extractOriginalEvenoddDs(preprocessed);

  const flattenedSvg = await picoFromFile(filePath, preprocessed);
  const parsed = parseFlattenedSvg(flattenedSvg, {
    onSanitize: (original) => {
      logger?.info(
        `  ⚠ Sanitized path in "${fileLabel}": path was missing initial moveto (prepended M from endpoint)`
      );
      logger?.info(`    Original: ${original.slice(0, 80)}…`);
    },
  });

  // Restore evenodd data, convert to nonzero winding, and mark noMerge so
  // hole contours don't cancel adjacent paths.
  if (originalEvenoddDs.length > 0) {
    restoreOriginalEvenoddDs(parsed.paths, originalEvenoddDs);
  }
  for (const p of parsed.paths) {
    if (p.fillRule === 'evenodd') {
      logger?.info(
        `  ↻ Converting evenodd path to nonzero winding in "${fileLabel}"`
      );
      p.d = convertEvenoddToWinding(PathKit, p.d);
      delete p.fillRule;
      (p as ParsedPath).noMerge = true;
    }
  }

  const mergedPaths = mergeSameColorPaths(parsed.paths, logger);

  return { viewBox: parsed.viewBox, paths: mergedPaths };
}
