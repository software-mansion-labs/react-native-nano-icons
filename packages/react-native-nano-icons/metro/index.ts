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
  watchFolders?: readonly string[];
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

function isInside(dir: string, root: string): boolean {
  const relative = path.relative(root, dir);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function unwatchedIconSets(
  iconSets: IconSetConfig[],
  projectRoot: string,
  watchFolders: readonly string[]
): IconSetConfig[] {
  const roots = [projectRoot, ...watchFolders];
  return iconSets.filter((set) => {
    const inputDir = path.resolve(projectRoot, set.inputDir);
    return !roots.some((root) => isInside(inputDir, root));
  });
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

    for (const set of unwatchedIconSets(
      iconSets,
      projectRoot,
      config.watchFolders ?? []
    )) {
      logger.warn(
        `Icon set "${set.fontFamily ?? path.basename(set.inputDir)}": ${set.inputDir} is outside Metro's watch folders, so its svg changes will not trigger a rebuild. Add the folder to watchFolders in metro.config.js.`
      );
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
