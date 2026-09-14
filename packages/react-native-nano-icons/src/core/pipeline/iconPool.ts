import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { loadPathKit } from '../pathkit/load';
import { prepareIcon, type IconResult, type IconTask } from './prepareIcon';

const WORKER_PATH = path.join(__dirname, 'prepareWorker.js');

export function defaultConcurrency(): number {
  return Math.max(1, Math.min(8, os.availableParallelism()));
}

export async function prepareIcons(
  tasks: IconTask[],
  concurrency: number
): Promise<IconResult[]> {
  const workers = Math.min(concurrency, tasks.length);
  if (workers <= 1 || !fs.existsSync(WORKER_PATH)) {
    const pathkit = await loadPathKit();
    const results: IconResult[] = [];
    for (const task of tasks) results.push(await prepareIcon(task, pathkit));
    return results;
  }

  const results: IconResult[] = new Array(tasks.length);
  let next = 0;

  const runWorker = () =>
    new Promise<void>((resolve, reject) => {
      const worker = new Worker(WORKER_PATH);
      let current = -1;
      const dispatch = () => {
        if (next >= tasks.length) {
          worker.terminate().then(() => resolve(), reject);
          return;
        }
        current = next++;
        worker.postMessage(tasks[current]);
      };
      worker.on('message', (result: IconResult) => {
        results[current] = result;
        dispatch();
      });
      worker.on('error', (err) => {
        worker.terminate().finally(() => reject(err));
      });
      dispatch();
    });

  await Promise.all(Array.from({ length: workers }, runWorker));
  return results;
}
