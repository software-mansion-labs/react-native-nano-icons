import fsp from 'node:fs/promises';

import { flattenSvg } from '../flatten/index';
import { mergeSameColorPaths } from '../glyph/merge';
import { parseFlattenedSvg, type ParsedPath } from '../glyph/parse';
import { preprocessSvg, validateSvg } from '../glyph/validate';
import type { PathKitModule } from '../pathkit/types';
import { KNOCKOUT_ATTRIBUTE, markKnockoutFills } from '../symbols/knockout';
import type { NanoLogger } from '../types';

export type PreparedSvg = {
  viewBox: [number, number, number, number];
  /** Z-ordered, same-color-merged, nonzero-winding layers. */
  paths: ParsedPath[];
};

function tagKnockoutPaths(
  paths: ParsedPath[],
  svg: string,
  pathkit: PathKitModule,
  fileLabel: string,
  logger?: NanoLogger
): void {
  const marked = markKnockoutFills(svg);
  if (marked === null) return;
  const markedPaths = parseFlattenedSvg(flattenSvg(marked, pathkit)).paths;
  if (markedPaths.length !== paths.length) {
    logger?.warn(
      `${fileLabel}: ignoring ${KNOCKOUT_ATTRIBUTE}, the annotated elements change the flattened shape count`
    );
    return;
  }
  markedPaths.forEach((markedPath, i) => {
    if (markedPath.fill !== paths[i]!.fill) paths[i]!.knockout = true;
  });
}

/**
 * Shared per-file SVG prep: validate → preprocess → flatten → parse →
 * same-color merge. Returns null for unsupported SVGs.
 */
export async function prepareSvgLayers(opts: {
  filePath: string;
  /** Label used in log messages, e.g. `"MyIcons:heart.svg"`. */
  fileLabel: string;
  pathkit: PathKitModule;
  logger?: NanoLogger;
  tagKnockouts?: boolean;
}): Promise<PreparedSvg | null> {
  const { filePath, fileLabel, pathkit, logger } = opts;

  const rawContent = (await fsp.readFile(filePath, 'utf-8')).replace(
    /^\uFEFF/,
    ''
  );

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

  if (opts.tagKnockouts) {
    tagKnockoutPaths(parsed.paths, preprocessed, pathkit, fileLabel, logger);
  }

  const mergedPaths = mergeSameColorPaths(parsed.paths, pathkit, logger);

  return { viewBox: parsed.viewBox, paths: mergedPaths };
}
