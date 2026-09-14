import path from 'node:path';

import { shouldSkipPath } from '../glyph/parse';
import { computePlacement, transformPathForFont } from '../glyph/placement';
import type { PathKitModule } from '../pathkit/types';
import type { NanoLogger } from '../types';
import { prepareSvgLayers } from './prepare';

export type IconTask = {
  file: string;
  filePath: string;
  fontFamily: string;
  upm: number;
  safeZone: number;
};

export type IconLog = [level: 'info' | 'warn' | 'fail', message: string];

export type IconLayer = { fill: string | null; d: string };

export type IconResult = {
  file: string;
  iconName: string;
  adv: number;
  layers: IconLayer[];
  logs: IconLog[];
  error: string | null;
};

function collectingLogger(logs: IconLog[]): NanoLogger {
  const push = (level: IconLog[0]) => (msg: string) => {
    logs.push([level, msg]);
  };
  return {
    start: () => {},
    update: () => {},
    succeed: () => {},
    fail: push('fail'),
    info: push('info'),
    warn: push('warn'),
  };
}

export async function prepareIcon(
  task: IconTask,
  pathkit: PathKitModule
): Promise<IconResult> {
  const logs: IconLog[] = [];
  const logger = collectingLogger(logs);
  const iconName = path.parse(task.file).name;
  const fileLabel = `[${task.fontFamily}: ${task.file}]`;
  const result: IconResult = {
    file: task.file,
    iconName,
    adv: 0,
    layers: [],
    logs,
    error: null,
  };

  logger.info(`Processing ${task.file}`);

  let prepared;
  try {
    prepared = await prepareSvgLayers({
      filePath: task.filePath,
      fileLabel,
      pathkit,
      logger,
    });
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
  if (!prepared) return result;

  const { vx, vy, scale, xOff, yOff, adv } = computePlacement({
    upm: task.upm,
    safeZone: task.safeZone,
    viewBox: prepared.viewBox,
  });
  result.adv = adv;

  for (const p of prepared.paths) {
    if (shouldSkipPath(p.d, p.fill)) continue;
    result.layers.push({
      fill: p.fill,
      d: transformPathForFont(pathkit, p.d, {
        vx,
        vy,
        scale,
        xOff,
        yOff,
        upm: task.upm,
      }),
    });
  }

  if (result.layers.length === 0) {
    logger.warn(`${fileLabel} produced no glyphs: nothing in it paints`);
  }
  return result;
}
