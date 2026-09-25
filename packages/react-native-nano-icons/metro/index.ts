import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createQuietLogger,
  detectExpoLogLevel,
  loadIconSetsFromAppConfig,
  loadNanoIconsConfig,
  type IconSetConfig,
  type NanoLogger,
} from '../cli/index';
import {
  FontRebuildWatcher,
  type DevLogger,
  type FileWatcher,
  type Next,
} from './fontRebuildWatcher';

export type { IconSetConfig };

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: Next
) => void;

export type MetroServerLike = {
  getBundler(): { getBundler(): { getWatcher(): FileWatcher } };
};

export type MetroConfigLike = {
  projectRoot?: string;
  server?: {
    enhanceMiddleware?: (
      middleware: Middleware,
      server: MetroServerLike
    ) => Middleware;
  };
};

export type WithNanoIconsOptions = {
  iconSets?: IconSetConfig[];
  projectRoot?: string;
};

export type WithNanoIcons<T extends MetroConfigLike> = T & {
  server: NonNullable<T['server']> & {
    enhanceMiddleware: (
      middleware: Middleware,
      server: MetroServerLike
    ) => Middleware;
  };
};

export function resolveIconSets(projectRoot: string): IconSetConfig[] {
  if (fs.existsSync(path.join(projectRoot, '.nanoicons.json'))) {
    return loadNanoIconsConfig(projectRoot).iconSets;
  }
  return loadIconSetsFromAppConfig(projectRoot);
}

function bufferedLogger(): DevLogger {
  const ready = createQuietLogger(detectExpoLogLevel());
  const verbose = createQuietLogger('verbose');
  const call =
    (method: keyof NanoLogger) =>
    (msg: string): void => {
      void ready.then((logger) => logger[method](msg));
    };
  return {
    start: call('start'),
    update: call('update'),
    succeed: call('succeed'),
    fail: call('fail'),
    info: call('info'),
    warn: call('warn'),
    notify: (msg) => void verbose.then((logger) => logger.info(msg)),
  };
}

export function withNanoIcons<T extends MetroConfigLike>(
  config: T,
  options?: WithNanoIconsOptions
): WithNanoIcons<T> {
  const projectRoot =
    options?.projectRoot ?? config.projectRoot ?? process.cwd();
  const previous = config.server?.enhanceMiddleware;

  const enhanceMiddleware = (
    middleware: Middleware,
    server: MetroServerLike
  ): Middleware => {
    const enhanced = previous ? previous(middleware, server) : middleware;
    if (process.env['NODE_ENV'] === 'production') return enhanced;

    const logger = bufferedLogger();
    let iconSets: IconSetConfig[];
    try {
      iconSets = options?.iconSets ?? resolveIconSets(projectRoot);
    } catch (err) {
      logger.warn(
        `Icon hot reload is off: ${err instanceof Error ? err.message : String(err)}`
      );
      return enhanced;
    }

    const fonts = new FontRebuildWatcher(
      projectRoot,
      iconSets,
      server.getBundler().getBundler().getWatcher(),
      logger
    );
    return (req, res, next) =>
      fonts.middleware(req, res, () => enhanced(req, res, next));
  };

  return {
    ...config,
    server: { ...config.server, enhanceMiddleware },
  } as WithNanoIcons<T>;
}
