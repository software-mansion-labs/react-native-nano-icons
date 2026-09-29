import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { loadPathKit } from '../pathkit/load';
import {
  prepareSvg,
  type SvgPrepareTask,
  type SvgPrepareResult,
} from './prepareSvg';

const WORKER_PATH = path.join(__dirname, 'prepareWorker.js');

export function defaultConcurrency(): number {
  return Math.max(1, Math.min(8, os.availableParallelism()));
}

async function prepareInProcess<T extends SvgPrepareTask>(
  tasks: T[]
): Promise<SvgPrepareResult<T>[]> {
  const pathkit = await loadPathKit();
  const results: SvgPrepareResult<T>[] = [];
  for (const task of tasks) results.push(await prepareSvg(task, pathkit));
  return results;
}

export class SvgWorkerPool {
  private readonly workers: Worker[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly size = defaultConcurrency()) {}

  prepare<T extends SvgPrepareTask>(
    tasks: T[]
  ): Promise<SvgPrepareResult<T>[]> {
    const run = this.queue.then(() => this.run(tasks));
    this.queue = run.catch(() => {});
    return run;
  }

  warm(): void {
    if (!fs.existsSync(WORKER_PATH)) return;
    for (let i = this.workers.length; i < this.size; i++) {
      const worker = new Worker(WORKER_PATH);
      worker.unref();
      this.workers.push(worker);
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.splice(0).map((w) => w.terminate()));
  }

  private async run<T extends SvgPrepareTask>(
    tasks: T[]
  ): Promise<SvgPrepareResult<T>[]> {
    const wanted = Math.min(this.size, tasks.length);
    if (wanted <= 1 || !fs.existsSync(WORKER_PATH)) {
      return prepareInProcess(tasks);
    }
    for (let i = this.workers.length; i < wanted; i++) {
      this.workers.push(new Worker(WORKER_PATH));
    }

    const results: SvgPrepareResult<T>[] = new Array(tasks.length);
    let next = 0;

    const drain = (worker: Worker) =>
      new Promise<void>((resolve, reject) => {
        let current = -1;
        const onMessage = (result: SvgPrepareResult<T>) => {
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

export async function prepareIcons<T extends SvgPrepareTask>(
  tasks: T[],
  concurrency: number
): Promise<SvgPrepareResult<T>[]> {
  const pool = new SvgWorkerPool(concurrency);
  try {
    return await pool.prepare(tasks);
  } finally {
    await pool.close();
  }
}
