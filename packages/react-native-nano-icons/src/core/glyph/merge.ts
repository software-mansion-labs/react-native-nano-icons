import type { NanoLogger } from '../types';
import type { ParsedPath } from './parse';

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
 * Merge consecutive same-color paths into single compound paths.
 * Preserves z-order: only merges runs of adjacent paths with identical fill color.
 */
export function mergeSameColorPaths(
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
