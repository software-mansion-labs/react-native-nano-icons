import crypto from 'node:crypto';
import fs from 'node:fs';

import { prepareIcons, type SvgWorkerPool } from './iconPool';
import type { IconResult, IconTask } from './prepareIcon';

export type PreparedSvgCache = Map<string, IconResult>;

export function preparedSvgCacheKey(task: IconTask, hash?: string): string {
  const contentHash =
    hash ??
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(task.filePath))
      .digest('hex');
  return `${task.file}:${task.upm}:${task.safeZone}:${contentHash}`;
}

export async function prepareIconsWithCache(
  tasks: IconTask[],
  concurrency: number,
  cache: PreparedSvgCache | undefined,
  pool?: SvgWorkerPool,
  svgHashByFile?: Map<string, string>
): Promise<IconResult[]> {
  const prepare = (batch: IconTask[]) =>
    pool ? pool.prepare(batch) : prepareIcons(batch, concurrency);
  if (!cache) return prepare(tasks);

  const results: IconResult[] = new Array(tasks.length);
  const keys: string[] = new Array(tasks.length);
  const misses: number[] = [];
  tasks.forEach((task, i) => {
    keys[i] = preparedSvgCacheKey(task, svgHashByFile?.get(task.file));
    const hit = cache.get(keys[i]!);
    if (hit) results[i] = hit;
    else misses.push(i);
  });

  const fresh = await prepare(misses.map((i) => tasks[i]!));
  fresh.forEach((result, j) => {
    const i = misses[j]!;
    results[i] = result;
    cache.set(keys[i]!, result);
  });
  return results;
}
