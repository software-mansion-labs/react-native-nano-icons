import crypto from 'node:crypto';
import fs from 'node:fs';

import { prepareIcons } from './iconPool';
import type { IconResult, IconTask } from './prepareIcon';

export type PreparedSvgCache = Map<string, IconResult>;

export function preparedSvgCacheKey(task: IconTask): string {
  const digest = crypto
    .createHash('sha256')
    .update(fs.readFileSync(task.filePath))
    .digest('hex');
  return `${task.file}:${task.upm}:${task.safeZone}:${digest}`;
}

export async function prepareIconsWithCache(
  tasks: IconTask[],
  concurrency: number,
  cache: PreparedSvgCache | undefined
): Promise<IconResult[]> {
  if (!cache) return prepareIcons(tasks, concurrency);

  const results: IconResult[] = new Array(tasks.length);
  const keys: string[] = new Array(tasks.length);
  const misses: number[] = [];
  tasks.forEach((task, i) => {
    keys[i] = preparedSvgCacheKey(task);
    const hit = cache.get(keys[i]!);
    if (hit) results[i] = hit;
    else misses.push(i);
  });

  const fresh = await prepareIcons(
    misses.map((i) => tasks[i]!),
    concurrency
  );
  fresh.forEach((result, j) => {
    const i = misses[j]!;
    results[i] = result;
    cache.set(keys[i]!, result);
  });
  return results;
}
