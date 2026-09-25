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

async function prepareInProcess(tasks: IconTask[]): Promise<IconResult[]> {
  const pathkit = await loadPathKit();
  const results: IconResult[] = [];
  for (const task of tasks) results.push(await prepareIcon(task, pathkit));
  return results;
}

export class SvgWorkerPool {
  private readonly workers: Worker[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly size = defaultConcurrency()) {}

  prepare(tasks: IconTask[]): Promise<IconResult[]> {
    const run = this.queue.then(() => this.run(tasks));
    this.queue = run.catch(() => {});
    return run;
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.splice(0).map((w) => w.terminate()));
  }

  private async run(tasks: IconTask[]): Promise<IconResult[]> {
    const wanted = Math.min(this.size, tasks.length);
    if (wanted <= 1 || !fs.existsSync(WORKER_PATH)) {
      return prepareInProcess(tasks);
    }
    while (this.workers.length < wanted) {
      this.workers.push(new Worker(WORKER_PATH));
    }

    const results: IconResult[] = new Array(tasks.length);
    let next = 0;

    const drain = (worker: Worker) =>
      new Promise<void>((resolve, reject) => {
        let current = -1;
        const onMessage = (result: IconResult) => {
          results[current] = result;
          dispatch();
        };
        const onError = (err: Error) => {
          detach();
          this.discard(worker);
          reject(err);
        };
        const detach = () => {
          worker.off('message', onMessage);
          worker.off('error', onError);
          worker.unref();
        };
        const dispatch = () => {
          if (next >= tasks.length) {
            detach();
            resolve();
            return;
          }
          current = next++;
          worker.postMessage(tasks[current]);
        };
        worker.ref();
        worker.on('message', onMessage);
        worker.on('error', onError);
        dispatch();
      });

    await Promise.all(this.workers.slice(0, wanted).map(drain));
    return results;
  }

  private discard(worker: Worker): void {
    const i = this.workers.indexOf(worker);
    if (i !== -1) this.workers.splice(i, 1);
    void worker.terminate();
  }
}

export async function prepareIcons(
  tasks: IconTask[],
  concurrency: number
): Promise<IconResult[]> {
  const pool = new SvgWorkerPool(concurrency);
  try {
    return await pool.prepare(tasks);
  } finally {
    await pool.close();
  }
}
