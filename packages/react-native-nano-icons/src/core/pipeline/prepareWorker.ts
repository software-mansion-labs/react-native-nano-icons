import { parentPort } from 'node:worker_threads';

import { loadPathKit } from '../pathkit/load';
import { prepareIcon, type IconTask } from './prepareIcon';

const port = parentPort;
if (!port) throw new Error('prepareWorker must run inside a worker thread');

port.on('message', async (task: IconTask) => {
  const pathkit = await loadPathKit();
  port.postMessage(await prepareIcon(task, pathkit));
});
