import crypto from 'node:crypto';
import fs from 'node:fs';

import { prepareIcons, type SvgWorkerPool } from './iconPool';
import type { IconTask } from './prepareIcon';
import type { SvgPrepareTask, SvgPrepareResult } from './prepareSvg';

export type PreparedSvgCache<T extends SvgPrepareTask = IconTask> = Map<
  string,
  SvgPrepareResult<T>
>;

export function preparedSvgCacheKey(
  task: SvgPrepareTask,
  hash?: string
): string {
  const contentHash =
    hash ??
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(task.filePath))
      .digest('hex');
  if (task.kind === 'symbol') {
    return `symbol:${task.setName}:${task.file}:${task.prefix}:${task.multicolor}:${contentHash}`;
  }
  return `${task.file}:${task.upm}:${task.safeZone}:${contentHash}`;
}

export async function prepareIconsWithCache<T extends SvgPrepareTask>(
  tasks: T[],
  concurrency: number,
  cache: PreparedSvgCache<T> | undefined,
  pool?: SvgWorkerPool,
  svgHashByFile?: Map<string, string>
): Promise<SvgPrepareResult<T>[]> {
  const prepare = (batch: T[]) =>
    pool ? pool.prepare(batch) : prepareIcons(batch, concurrency);
  if (!cache) return prepare(tasks);

  const results: SvgPrepareResult<T>[] = new Array(tasks.length);
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
