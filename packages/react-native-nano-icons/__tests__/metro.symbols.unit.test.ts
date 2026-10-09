/** @jest-environment node */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.mock('chalk', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => (s: string) => s }),
}));

jest.mock('../cli/buildSymbols', () => {
  const actual = jest.requireActual('../cli/buildSymbols');
  return { ...actual, buildAllSymbols: jest.fn() };
});

jest.mock('../cli/link', () => {
  const actual = jest.requireActual('../cli/link');
  return {
    ...actual,
    linkBareSymbols: jest.fn(),
    linkBareAndroidDrawables: jest.fn(),
  };
});

import {
  buildAllSymbols,
  SymbolSetBuildError,
  type BuiltSymbolSet,
  type SymbolSetConfig,
} from '../cli/buildSymbols';
import { linkBareAndroidDrawables, linkBareSymbols } from '../cli/link';
import { SvgWorkerPool } from '../src/core/pipeline/iconPool';
import type { DevLogger } from '../metro/fontRebuildWatcher';
import { SymbolRebuildWatcher } from '../metro/symbolRebuildWatcher';
import { resolveSymbolSets } from '../metro/index';

const mockBuildAllSymbols = buildAllSymbols as jest.MockedFunction<
  typeof buildAllSymbols
>;
const mockLinkSymbols = linkBareSymbols as jest.MockedFunction<
  typeof linkBareSymbols
>;
const mockLinkDrawables = linkBareAndroidDrawables as jest.MockedFunction<
  typeof linkBareAndroidDrawables
>;

let root: string;
const logged: string[] = [];
const logger: DevLogger = {
  start: () => {},
  notify: (msg) => logged.push(`notify ${msg}`),
  update: () => {},
  succeed: () => {},
  fail: (msg) => logged.push(`fail ${msg}`),
  info: () => {},
  warn: (msg) => logged.push(`warn ${msg}`),
};

function makeSet(name: string): SymbolSetConfig {
  return { inputDir: `./symbols/${name}`, name };
}

function builtSet(set: SymbolSetConfig): BuiltSymbolSet {
  return { name: set.name! } as BuiltSymbolSet;
}

function change(set: SymbolSetConfig, file: string, type = 'change') {
  return {
    eventsQueue: [{ filePath: path.join(root, set.inputDir, file), type }],
  };
}

const flush = (ms = 80): Promise<void> => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nano-sym-')));
  logged.length = 0;
  mockBuildAllSymbols.mockReset();
  mockBuildAllSymbols.mockImplementation(async (sets) => sets.map(builtSet));
  mockLinkSymbols.mockReset();
  mockLinkDrawables.mockReset();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('SymbolRebuildWatcher', () => {
  test('does not build or relink on start', async () => {
    const watcher = new EventEmitter();
    new SymbolRebuildWatcher(
      root,
      [makeSet('a')],
      watcher,
      logger,
      new SvgWorkerPool()
    );
    await flush();
    expect(mockBuildAllSymbols).not.toHaveBeenCalled();
    expect(mockLinkSymbols).not.toHaveBeenCalled();
  });

  test('an svg change rebuilds and relinks every set, then asks for a native rebuild', async () => {
    const watcher = new EventEmitter();
    const sets = [makeSet('a'), makeSet('b')];
    const pool = new SvgWorkerPool();
    new SymbolRebuildWatcher(root, sets, watcher, logger, pool);

    watcher.emit('change', change(sets[0]!, 'home.svg'));
    await flush();

    expect(mockBuildAllSymbols).toHaveBeenCalledTimes(1);
    expect(mockBuildAllSymbols.mock.calls[0]![0]).toEqual(sets);
    expect(mockBuildAllSymbols.mock.calls[0]![2]).toEqual(
      expect.objectContaining({
        keepOutputsOnFailure: true,
        preparedSvgCache: expect.any(Map),
        svgWorkerPool: pool,
      })
    );
    const built = sets.map(builtSet);
    expect(mockLinkSymbols).toHaveBeenCalledWith(root, built, logger);
    expect(mockLinkDrawables).toHaveBeenCalledWith(root, built, logger);
    expect(logged).toEqual([
      'notify Symbols: home.svg changed, rebuilding…',
      'warn Native symbols changed. Rebuild the native app to see them.',
    ]);
  });

  test('non-svg files and files outside the input dirs are ignored', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('a');
    new SymbolRebuildWatcher(root, [a], watcher, logger, new SvgWorkerPool());

    watcher.emit('change', change(a, 'notes.txt'));
    watcher.emit('change', change(makeSet('other'), 'home.svg'));
    await flush();

    expect(mockBuildAllSymbols).not.toHaveBeenCalled();
  });

  test('a burst of events is coalesced into one build', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('a');
    new SymbolRebuildWatcher(root, [a], watcher, logger, new SvgWorkerPool());

    for (const file of ['1.svg', '2.svg', '3.svg', '4.svg']) {
      watcher.emit('change', change(a, file));
    }
    await flush();

    expect(mockBuildAllSymbols).toHaveBeenCalledTimes(1);
    expect(logged[0]).toBe(
      'notify Symbols: 1.svg changed, 2.svg changed, 3.svg changed and 1 more, rebuilding…'
    );
  });

  test('a failed set leaves the native project untouched', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('a');
    mockBuildAllSymbols.mockRejectedValue(
      new SymbolSetBuildError('1 symbol set failed to build: a', [])
    );
    new SymbolRebuildWatcher(root, [a], watcher, logger, new SvgWorkerPool());

    watcher.emit('change', change(a, 'home.svg'));
    await flush();

    expect(mockLinkSymbols).not.toHaveBeenCalled();
    expect(mockLinkDrawables).not.toHaveBeenCalled();
    expect(logged).toContain(
      'warn 1 symbol set failed to build: a. Native symbols were not relinked.'
    );
  });

  test('keeps rebuilding after an unexpected error', async () => {
    const watcher = new EventEmitter();
    const a = makeSet('a');
    mockBuildAllSymbols.mockRejectedValueOnce(new Error('boom'));
    new SymbolRebuildWatcher(root, [a], watcher, logger, new SvgWorkerPool());

    watcher.emit('change', change(a, 'home.svg'));
    await flush();
    watcher.emit('change', change(a, 'home.svg'));
    await flush();

    expect(logged).toContain('fail boom');
    expect(mockBuildAllSymbols).toHaveBeenCalledTimes(2);
    expect(mockLinkSymbols).toHaveBeenCalledTimes(1);
  });
});

describe('resolveSymbolSets', () => {
  test('reads symbolSets from .nanoicons.json', () => {
    fs.writeFileSync(
      path.join(root, '.nanoicons.json'),
      JSON.stringify({ symbolSets: [makeSet('tabs')] })
    );
    expect(resolveSymbolSets(root)).toEqual([makeSet('tabs')]);
  });

  test('is empty when .nanoicons.json has only iconSets', () => {
    fs.writeFileSync(
      path.join(root, '.nanoicons.json'),
      JSON.stringify({ iconSets: [{ inputDir: './icons', fontFamily: 'A' }] })
    );
    expect(resolveSymbolSets(root)).toEqual([]);
  });
});
