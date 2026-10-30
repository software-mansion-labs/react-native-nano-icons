import {
  analyzeWinding,
  pathDataWithWinding,
  type WindingAnalysis,
} from '../pathkit/winding';
import type { PathKitModule } from '../pathkit/types';
import type { NanoLogger } from '../types';
import type { ParsedPath } from './parse';

/**
 * Merge consecutive same-color paths into single compound paths.
 * Preserves z-order: only merges runs of adjacent paths with identical fill color.
 */
export function mergeSameColorPaths(
  paths: ParsedPath[],
  pathkit: PathKitModule,
  logger?: NanoLogger
): ParsedPath[] {
  if (paths.length <= 1) return paths;

  const analyses = new Map<number, WindingAnalysis | null>();
  const analysisOf = (index: number) => {
    if (!analyses.has(index)) {
      analyses.set(index, analyzeWinding(pathkit, paths[index]!.d));
    }
    return analyses.get(index)!;
  };

  const result: ParsedPath[] = [];
  let i = 0;

  while (i < paths.length) {
    const { fill, knockout } = paths[i]!;
    const ds: string[] = [];
    let sign: -1 | 1 = 1;
    let j = i + 1;
    while (
      j < paths.length &&
      paths[j]!.fill === fill &&
      paths[j]!.knockout === knockout &&
      analysisOf(i) !== null &&
      analysisOf(j) !== null
    ) {
      if (ds.length === 0) {
        const first = analysisOf(i)!;
        sign = first.outerSigns.find((s) => s !== 0) as -1 | 1;
        ds.push(pathDataWithWinding(pathkit, paths[i]!.d, first, sign));
      }
      ds.push(pathDataWithWinding(pathkit, paths[j]!.d, analysisOf(j)!, sign));
      j++;
    }

    if (ds.length === 0) {
      result.push(paths[i]!);
    } else {
      logger?.info(`    ⊕ Merged ${ds.length} same-color paths (fill=${fill})`);
      const d = ds.join(' ');
      result.push(knockout ? { d, fill, knockout } : { d, fill });
    }
    i = j;
  }
  return result;
}
