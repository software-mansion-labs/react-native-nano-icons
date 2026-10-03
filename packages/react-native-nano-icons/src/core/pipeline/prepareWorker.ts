import { parentPort } from 'node:worker_threads';

import { loadPathKit } from '../pathkit/load';
import { prepareSvg, type SvgPrepareTask } from './prepareSvg';

const port = parentPort;
if (!port) throw new Error('prepareWorker must run inside a worker thread');

const pathkitReady = loadPathKit();

port.on('message', async (task: SvgPrepareTask) => {
  port.postMessage(await prepareSvg(task, await pathkitReady));
});
