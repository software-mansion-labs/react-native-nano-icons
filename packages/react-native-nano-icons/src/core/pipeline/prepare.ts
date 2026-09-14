import fsp from 'node:fs/promises';

import { flattenSvg } from '../flatten/index';
import { mergeSameColorPaths } from '../glyph/merge';
import { parseFlattenedSvg, type ParsedPath } from '../glyph/parse';
import { preprocessSvg, validateSvg } from '../glyph/validate';
import { convertEvenoddToWinding } from '../pathkit/evenodd';
import type { PathKitModule } from '../pathkit/types';
import type { NanoLogger } from '../types';

export type PreparedSvg = {
  viewBox: [number, number, number, number];
  /** Z-ordered, same-color-merged, nonzero-winding layers. */
  paths: ParsedPath[];
};

/**
 * Shared per-file SVG prep: validate → preprocess → flatten → parse →
 * evenodd convert → same-color merge. Returns null for unsupported SVGs.
 */
export async function prepareSvgLayers(opts: {
  filePath: string;
  /** Label used in log messages, e.g. `"MyIcons:heart.svg"`. */
  fileLabel: string;
  pathkit: PathKitModule;
  logger?: NanoLogger;
}): Promise<PreparedSvg | null> {
  const { filePath, fileLabel, pathkit, logger } = opts;

  const rawContent = await fsp.readFile(filePath, 'utf-8');

  const validation = validateSvg(rawContent);
  if (validation.valid === false) {
    logger?.warn(`${fileLabel} skipped: ${validation.reason}`);
    return null;
  }

  const preprocessed = preprocessSvg(rawContent);

  let flattenedSvg: string;
  try {
    flattenedSvg = flattenSvg(preprocessed, pathkit);
  } catch (err) {
    throw new Error(
      `${fileLabel} failed to flatten: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err }
    );
  }
  const parsed = parseFlattenedSvg(flattenedSvg, {
    onSanitize: (original) => {
      logger?.info(
        `  ⚠ ${fileLabel} sanitized path: path was missing initial moveto (prepended M from endpoint)`
      );
      logger?.info(`    Original: ${original.slice(0, 80)}…`);
    },
    onMissingViewBox: (assumed) => {
      logger?.warn(
        `${fileLabel} has no viewBox; assuming [${assumed.join(' ')}]`
      );
    },
  });

  // Convert evenodd to nonzero winding with our containment-based
  // algorithm. Mark as noMerge — compound paths with holes must stay
  // separate so their CW hole contours don't cancel adjacent paths' CCW
  // contours.
  for (const p of parsed.paths) {
    if (p.fillRule === 'evenodd') {
      logger?.info(
        `  ↻ ${fileLabel} converting evenodd path to nonzero winding`
      );
      p.d = convertEvenoddToWinding(pathkit, p.d);
      delete p.fillRule;
      p.noMerge = true;
    }
  }

  const mergedPaths = mergeSameColorPaths(parsed.paths, logger);

  return { viewBox: parsed.viewBox, paths: mergedPaths };
}
