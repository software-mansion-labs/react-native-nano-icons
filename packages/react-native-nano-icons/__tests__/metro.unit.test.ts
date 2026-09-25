/** @jest-environment node */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

jest.mock('chalk', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => (s: string) => s }),
}));

jest.mock('../cli/build', () => {
  const actual = jest.requireActual('../cli/build');
  return { ...actual, buildAllFonts: jest.fn() };
});

import {
  buildAllFonts,
  type BuiltFont,
  type IconSetConfig,
} from '../cli/build';
import type { DevLogger } from '../metro/devSession';
import { DevSession, FONT_ROUTE } from '../metro/devSession';
import {
  withNanoIcons,
  resolveIconSets,
  type Middleware,
} from '../metro/index';

const mockBuildAllFonts = buildAllFonts as jest.MockedFunction<
  typeof buildAllFonts
>;

let root: string;
const logged: string[] = [];
const logger: DevLogger = {
  start: (msg) => logged.push(`start ${msg}`),
  notify: (msg) => logged.push(`notify ${msg}`),
  update: () => {},
  succeed: (msg) => logged.push(`ok ${msg}`),
  fail: (msg) => logged.push(`fail ${msg}`),
  info: () => {},
  warn: (msg) => logged.push(`warn ${msg}`),
};

function makeSet(name: string): IconSetConfig {
  return { inputDir: `./icons/${name}`, fontFamily: name };
}

function builtFont(set: IconSetConfig, hash: string): BuiltFont {
  const fontFamily = set.fontFamily!;
  const ttfPath = path.join(root, 'out', `${fontFamily}.ttf`);
  fs.mkdirSync(path.dirname(ttfPath), { recursive: true });
  fs.writeFileSync(ttfPath, `ttf:${fontFamily}:${hash}`);
  return {
    fontFamily,
    family: `${fontFamily}-${hash}`,
    ttfPath,
    glyphmapPath: path.join(root, 'out', `${fontFamily}.glyphmap.json`),
    linking: 'static',
  };
}

function svgPath(set: IconSetConfig, file: string): string {
  return path.join(root, set.inputDir, file);
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 80));

type FakeResponse = ServerResponse & {
  headers: Record<string, string>;
  body(): Promise<string>;
};

function request(
  url: string,
  method = 'GET'
): { req: IncomingMessage; res: FakeResponse; next: jest.Mock } {
  const res = new PassThrough() as unknown as FakeResponse;
  res.statusCode = 200;
  res.headers = {};
  (res as { setHeader: unknown }).setHeader = (name: string, value: string) => {
    res.headers[name] = value;
  };
  res.body = () =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
  return {
    req: { url, method } as IncomingMessage,
    res,
    next: jest.fn(),
  };
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nano-metro-')));
  logged.length = 0;
  mockBuildAllFonts.mockReset();
  mockBuildAllFonts.mockImplementation(async (sets) =>
    sets.map((set) => builtFont(set, 'aaaaaaaa'))
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('DevSession — watching', () => {
  test('builds every set once on start', async () => {
    const watcher = new EventEmitter();
    const sets = [makeSet('A'), makeSet('B')];
    new DevSession(root, sets, watcher, logger);
    await flush();
    expect(mockBuildAllFonts).toHaveBeenCalledTimes(1);
    expect(mockBuildAllFonts.mock.calls[0]![0]).toEqual(sets);
    expect(mockBuildAllFonts.mock.calls[0]![2]).toEqual(
      expect.objectContaining({
        keepOutputsOnFailure: true,
        preparedSvgCache: expect.any(Map),
      })
    );
  });

  test('one prepare cache is shared by every build of the session', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('A');
    new DevSession(root, [a], watcher, logger);
    await flush();
    watcher.emit('change', {
      eventsQueue: [{ filePath: svgPath(a, 'x.svg'), type: 'change' }],
    });
    await flush();

    const caches = mockBuildAllFonts.mock.calls.map(
      (c) => c[2]?.preparedSvgCache
    );
    expect(caches).toHaveLength(2);
    expect(caches[0]).toBe(caches[1]);
  });

  test('an svg change rebuilds only the set that owns it', async () => {
    const watcher = new EventEmitter();
    const [a, b] = [makeSet('A'), makeSet('B')];
    new DevSession(root, [a, b], watcher, logger);
    await flush();

    watcher.emit('change', {
      eventsQueue: [{ filePath: svgPath(b, 'x.svg'), type: 'change' }],
    });
    await flush();

    expect(mockBuildAllFonts).toHaveBeenCalledTimes(2);
    expect(mockBuildAllFonts.mock.calls[1]![0]).toEqual([b]);
  });

  test('announces what changed before rebuilding', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('A');
    new DevSession(root, [a], watcher, logger);
    await flush();
    expect(logged.filter((l) => l.startsWith('notify'))).toEqual([]);

    watcher.emit('change', {
      eventsQueue: [
        { filePath: svgPath(a, 'star.svg'), type: 'change' },
        { filePath: svgPath(a, 'heart.svg'), type: 'add' },
        { filePath: svgPath(a, 'old.svg'), type: 'delete' },
        { filePath: svgPath(a, 'x.svg'), type: 'change' },
        { filePath: svgPath(a, 'y.svg'), type: 'change' },
      ],
    });
    await flush();

    expect(logged.filter((l) => l.startsWith('notify'))).toEqual([
      'notify A: star.svg changed, heart.svg added, old.svg removed and 2 more, rebuilding…',
    ]);
  });

  test('add and delete count as changes', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('A');
    new DevSession(root, [a], watcher, logger);
    await flush();

    watcher.emit('change', {
      eventsQueue: [{ filePath: svgPath(a, 'new.svg'), type: 'add' }],
    });
    await flush();
    watcher.emit('change', {
      eventsQueue: [{ filePath: svgPath(a, 'old.svg'), type: 'delete' }],
    });
    await flush();

    expect(mockBuildAllFonts).toHaveBeenCalledTimes(3);
  });

  test('files outside the input dirs, non-svg files and nested dirs are ignored', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('A');
    new DevSession(root, [a], watcher, logger);
    await flush();

    watcher.emit('change', {
      eventsQueue: [
        {
          filePath: path.join(root, 'icons', 'other', 'x.svg'),
          type: 'change',
        },
        { filePath: svgPath(a, 'notes.txt'), type: 'change' },
        { filePath: svgPath(a, path.join('nested', 'x.svg')), type: 'change' },
        { filePath: path.join(root, 'out', 'A.ttf'), type: 'change' },
      ],
    });
    await flush();

    expect(mockBuildAllFonts).toHaveBeenCalledTimes(1);
  });

  test('a burst of events is coalesced into one build', async () => {
    const watcher = new EventEmitter();
    const [a, b] = [makeSet('A'), makeSet('B')];
    new DevSession(root, [a, b], watcher, logger);
    await flush();

    for (const file of ['1.svg', '2.svg', '3.svg']) {
      watcher.emit('change', {
        eventsQueue: [{ filePath: svgPath(a, file), type: 'change' }],
      });
    }
    watcher.emit('change', {
      eventsQueue: [{ filePath: svgPath(b, '1.svg'), type: 'change' }],
    });
    await flush();

    expect(mockBuildAllFonts).toHaveBeenCalledTimes(2);
    expect(mockBuildAllFonts.mock.calls[1]![0]).toEqual([a, b]);
  });

  test('changes during a build queue one more build after it', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('A');
    let release!: () => void;
    mockBuildAllFonts.mockImplementationOnce(
      (sets) =>
        new Promise((resolve) => {
          release = () => resolve(sets.map((s) => builtFont(s, 'aaaaaaaa')));
        })
    );
    new DevSession(root, [a], watcher, logger);
    await flush();
    expect(mockBuildAllFonts).toHaveBeenCalledTimes(1);

    watcher.emit('change', {
      eventsQueue: [{ filePath: svgPath(a, '1.svg'), type: 'change' }],
    });
    await flush();
    expect(mockBuildAllFonts).toHaveBeenCalledTimes(1);

    release();
    await flush();
    expect(mockBuildAllFonts).toHaveBeenCalledTimes(2);
  });
});

describe('DevSession — web output', () => {
  test('woff2 is deferred until a web bundle is requested', async () => {
    const watcher = new EventEmitter();
    const native = makeSet('A');
    const web = { ...makeSet('B'), web: true };
    const session = new DevSession(root, [native, web], watcher, logger);
    await flush();
    expect(mockBuildAllFonts.mock.calls[0]![2]).toEqual(
      expect.objectContaining({ withWeb: false })
    );

    const ios = request('/index.bundle?platform=ios&dev=true');
    session.middleware(ios.req, ios.res, ios.next);
    await flush();
    expect(mockBuildAllFonts).toHaveBeenCalledTimes(1);

    const browser = request('/index.bundle?platform=web&dev=true');
    session.middleware(browser.req, browser.res, browser.next);
    expect(browser.next).toHaveBeenCalledTimes(1);
    await flush();
    expect(mockBuildAllFonts).toHaveBeenCalledTimes(2);
    expect(mockBuildAllFonts.mock.calls[1]![0]).toEqual([web]);
    expect(mockBuildAllFonts.mock.calls[1]![2]).toEqual(
      expect.objectContaining({ withWeb: true })
    );
    expect(logged).toContain('notify B: web bundle requested, rebuilding…');

    const again = request('/assets/?unstable_path=x.png&platform=web');
    session.middleware(again.req, again.res, again.next);
    await flush();
    expect(mockBuildAllFonts).toHaveBeenCalledTimes(2);

    watcher.emit('change', {
      eventsQueue: [{ filePath: svgPath(native, 'x.svg'), type: 'change' }],
    });
    await flush();
    expect(mockBuildAllFonts.mock.calls[2]![2]).toEqual(
      expect.objectContaining({ withWeb: true })
    );
  });
});

describe('DevSession — font endpoint', () => {
  test('serves the current build of a family and moves on after a rebuild', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('A');
    const session = new DevSession(root, [a], watcher, logger);
    await flush();

    const first = request(`${FONT_ROUTE}A-aaaaaaaa.ttf`);
    session.middleware(first.req, first.res, first.next);
    expect(await first.res.body()).toBe('ttf:A:aaaaaaaa');
    expect(first.res.statusCode).toBe(200);
    expect(first.res.headers['Content-Type']).toBe('font/ttf');
    expect(first.res.headers['Cache-Control']).toBe('no-store');
    expect(first.next).not.toHaveBeenCalled();

    mockBuildAllFonts.mockImplementationOnce(async (sets) =>
      sets.map((set) => builtFont(set, 'bbbbbbbb'))
    );
    watcher.emit('change', {
      eventsQueue: [{ filePath: svgPath(a, '1.svg'), type: 'change' }],
    });
    await flush();

    const stale = request(`${FONT_ROUTE}A-aaaaaaaa.ttf`);
    session.middleware(stale.req, stale.res, stale.next);
    await stale.res.body();
    expect(stale.res.statusCode).toBe(404);

    const fresh = request(`${FONT_ROUTE}A-bbbbbbbb.ttf?x=1`);
    session.middleware(fresh.req, fresh.res, fresh.next);
    expect(await fresh.res.body()).toBe('ttf:A:bbbbbbbb');
  });

  test('HEAD answers with headers and no body', async () => {
    const session = new DevSession(
      root,
      [makeSet('A')],
      new EventEmitter(),
      logger
    );
    await flush();

    const { req, res, next } = request(`${FONT_ROUTE}A-aaaaaaaa.ttf`, 'HEAD');
    session.middleware(req, res, next);
    expect(await res.body()).toBe('');
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('font/ttf');
  });

  test('waits for an in-flight build before answering', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('A');
    let release!: () => void;
    mockBuildAllFonts.mockImplementationOnce(
      (sets) =>
        new Promise((resolve) => {
          release = () => resolve(sets.map((s) => builtFont(s, 'aaaaaaaa')));
        })
    );
    const session = new DevSession(root, [a], watcher, logger);
    await flush();

    const { req, res, next } = request(`${FONT_ROUTE}A-aaaaaaaa.ttf`);
    session.middleware(req, res, next);
    let answered = false;
    const body = res.body().then((b) => {
      answered = true;
      return b;
    });
    await flush();
    expect(answered).toBe(false);

    release();
    expect(await body).toBe('ttf:A:aaaaaaaa');
  });

  test('unknown families are 404, other routes fall through', async () => {
    const session = new DevSession(
      root,
      [makeSet('A')],
      new EventEmitter(),
      logger
    );
    await flush();

    const unknown = request(`${FONT_ROUTE}Nope-12345678.ttf`);
    session.middleware(unknown.req, unknown.res, unknown.next);
    await unknown.res.body();
    expect(unknown.res.statusCode).toBe(404);
    expect(unknown.next).not.toHaveBeenCalled();

    for (const [url, method] of [
      ['/index.bundle?platform=ios', 'GET'],
      [`${FONT_ROUTE}A-aaaaaaaa.ttf`, 'POST'],
    ] as const) {
      const other = request(url, method);
      session.middleware(other.req, other.res, other.next);
      expect(other.next).toHaveBeenCalledTimes(1);
    }
  });

  test('a failed set keeps serving its last good build', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('A');
    const session = new DevSession(root, [a], watcher, logger);
    await flush();

    const { IconSetBuildError } = jest.requireActual('../cli/build');
    mockBuildAllFonts.mockRejectedValueOnce(
      new IconSetBuildError('1 icon set failed to build: A', [])
    );
    watcher.emit('change', {
      eventsQueue: [{ filePath: svgPath(a, '1.svg'), type: 'change' }],
    });
    await flush();

    const { req, res, next } = request(`${FONT_ROUTE}A-aaaaaaaa.ttf`);
    session.middleware(req, res, next);
    expect(await res.body()).toBe('ttf:A:aaaaaaaa');
  });
});

describe('withNanoIcons', () => {
  function metroServer(): {
    server: { getBundler(): { getBundler(): { getWatcher(): EventEmitter } } };
    watcher: EventEmitter;
  } {
    const watcher = new EventEmitter();
    return {
      watcher,
      server: {
        getBundler: () => ({
          getBundler: () => ({ getWatcher: () => watcher }),
        }),
      },
    };
  }

  test('chains the previous enhanceMiddleware and adds the font endpoint', async () => {
    const previous = jest.fn((m: Middleware) => m);
    const config = withNanoIcons(
      { projectRoot: root, server: { enhanceMiddleware: previous }, other: 1 },
      { iconSets: [makeSet('A')] }
    );
    expect(config.other).toBe(1);

    const { server, watcher } = metroServer();
    const inner = jest.fn();
    const enhanced = config.server.enhanceMiddleware(inner, server);
    expect(previous).toHaveBeenCalledWith(inner, server);
    expect(watcher.listenerCount('change')).toBe(1);
    await flush();

    const { req, res, next } = request(`${FONT_ROUTE}A-aaaaaaaa.ttf`);
    enhanced(req, res, next);
    expect(await res.body()).toBe('ttf:A:aaaaaaaa');

    const other = request('/status');
    enhanced(other.req, other.res, other.next);
    expect(inner).toHaveBeenCalledWith(
      other.req,
      other.res,
      expect.any(Function)
    );
  });

  test('is a no-op when NODE_ENV is production', async () => {
    const env = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const config = withNanoIcons(
        { projectRoot: root },
        { iconSets: [makeSet('A')] }
      );
      const { server, watcher } = metroServer();
      const inner = jest.fn();
      const enhanced = config.server.enhanceMiddleware(inner, server);
      expect(enhanced).toBe(inner);
      expect(watcher.listenerCount('change')).toBe(0);
      await flush();
      expect(mockBuildAllFonts).not.toHaveBeenCalled();
    } finally {
      process.env['NODE_ENV'] = env;
    }
  });

  test('reads .nanoicons.json from the project root', () => {
    fs.writeFileSync(
      path.join(root, '.nanoicons.json'),
      JSON.stringify({ iconSets: [makeSet('FromFile')] })
    );
    expect(resolveIconSets(root)).toEqual([makeSet('FromFile')]);
  });

  test('a missing config disables hot reload without breaking the server', () => {
    const config = withNanoIcons({ projectRoot: root });
    const { server, watcher } = metroServer();
    const inner = jest.fn();
    const enhanced = config.server.enhanceMiddleware(inner, server);
    expect(enhanced).toBe(inner);
    expect(watcher.listenerCount('change')).toBe(0);
  });
});
