/** @jest-environment node */

const mockBuildAllFonts = jest.fn();
const mockLinkBare = jest.fn();
const mockLoadNanoIconsConfig = jest.fn();
const mockLoadDynamicIconSets = jest.fn();
const mockLoadDynamicSetsFromAppConfig = jest.fn();

jest.mock('../cli/index', () => ({
  IconSetBuildError: jest.requireActual('../cli/build').IconSetBuildError,
  buildAllFonts: (...args: unknown[]) => mockBuildAllFonts(...args),
  linkBare: (...args: unknown[]) => mockLinkBare(...args),
  loadNanoIconsConfig: (...args: unknown[]) => mockLoadNanoIconsConfig(...args),
  loadDynamicIconSets: (...args: unknown[]) => mockLoadDynamicIconSets(...args),
  loadDynamicSetsFromAppConfig: (...args: unknown[]) =>
    mockLoadDynamicSetsFromAppConfig(...args),
  createOraLogger: jest.fn(),
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IconSetBuildError } from '../cli/build';
import type { NanoLogger } from '../cli/logger';
import { main } from '../scripts/cli';

const SETS = [{ inputDir: 'a' }, { inputDir: 'b' }, { inputDir: 'c' }];
const BUILT = [
  {
    fontFamily: 'A',
    family: 'A-1a2b3c4d',
    ttfPath: 'A.ttf',
    glyphmapPath: 'A.glyphmap.json',
    linking: 'static' as const,
  },
];

function silentLogger(): NanoLogger {
  return {
    start: () => {},
    update: () => {},
    succeed: () => {},
    fail: () => {},
    info: () => {},
    warn: () => {},
  };
}

describe('cli main', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    process.argv = ['node', 'cli'];
    jest.clearAllMocks();
    mockLoadNanoIconsConfig.mockReturnValue({ iconSets: SETS });
    mockLinkBare.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  test('links every built set against the configured total', async () => {
    mockBuildAllFonts.mockResolvedValue(BUILT);

    await main(silentLogger());

    expect(mockLinkBare).toHaveBeenCalledWith(
      process.cwd(),
      BUILT,
      expect.anything(),
      SETS.length
    );
  });

  test('a broken set still links the sets that built, then fails', async () => {
    const error = new IconSetBuildError('1 icon set failed to build: B', BUILT);
    mockBuildAllFonts.mockRejectedValue(error);

    await expect(main(silentLogger())).rejects.toBe(error);

    expect(mockLinkBare).toHaveBeenCalledWith(
      process.cwd(),
      BUILT,
      expect.anything(),
      SETS.length
    );
  });

  test('linking happens before the failure is raised', async () => {
    const order: string[] = [];
    mockBuildAllFonts.mockImplementation(async () => {
      order.push('build');
      throw new IconSetBuildError('x', BUILT);
    });
    mockLinkBare.mockImplementation(async () => {
      order.push('link');
    });

    await main(silentLogger()).catch(() => order.push('throw'));

    expect(order).toEqual(['build', 'link', 'throw']);
  });

  test('any other error skips linking entirely', async () => {
    mockBuildAllFonts.mockRejectedValue(
      new Error('Input directory does not exist')
    );

    await expect(main(silentLogger())).rejects.toThrow(
      'Input directory does not exist'
    );
    expect(mockLinkBare).not.toHaveBeenCalled();
  });

  const tempDirs: string[] = [];

  function makeFolder(isApp: boolean): string {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'nano-cli-'))
    );
    tempDirs.push(dir);
    if (isApp) fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, '.nanoicons.json'), '{"iconSets":[]}');
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function expectFullRun(configRoot: string, appRoot: string): void {
    expect(mockLoadNanoIconsConfig).toHaveBeenCalledWith(configRoot);
    expect(mockBuildAllFonts).toHaveBeenCalledWith(
      SETS,
      appRoot,
      expect.anything()
    );
    expect(mockLinkBare).toHaveBeenCalledWith(
      appRoot,
      BUILT,
      expect.anything(),
      SETS.length
    );
  }

  test('without --path the current directory is the app root', async () => {
    mockBuildAllFonts.mockResolvedValue(BUILT);

    await main(silentLogger());

    expectFullRun(process.cwd(), process.cwd());
  });

  test('--path to an app folder reads, builds and links there', async () => {
    const app = makeFolder(true);
    process.argv = ['node', 'cli', '--path', app];
    mockBuildAllFonts.mockResolvedValue(BUILT);

    await main(silentLogger());

    expectFullRun(app, app);
  });

  test("--path to an app's .nanoicons.json means that app", async () => {
    const app = makeFolder(true);
    process.argv = ['node', 'cli', '--path', path.join(app, '.nanoicons.json')];
    mockBuildAllFonts.mockResolvedValue(BUILT);

    await main(silentLogger());

    expectFullRun(app, app);
  });

  test('--path to a config folder reads the config there and builds and links in the current directory', async () => {
    const configFolder = makeFolder(false);
    process.argv = ['node', 'cli', '--path', configFolder];
    mockBuildAllFonts.mockResolvedValue(BUILT);

    await main(silentLogger());

    expectFullRun(configFolder, process.cwd());
  });

  test('--path to a .nanoicons.json outside an app folder keeps the current directory as the app', async () => {
    const configFolder = makeFolder(false);
    process.argv = [
      'node',
      'cli',
      '--path',
      path.join(configFolder, '.nanoicons.json'),
    ];
    mockBuildAllFonts.mockResolvedValue(BUILT);

    await main(silentLogger());

    expectFullRun(configFolder, process.cwd());
  });

  test('--dynamic with --path to an app folder reads and builds there', async () => {
    const app = makeFolder(true);
    process.argv = ['node', 'cli', '--dynamic', '--path', app];
    mockLoadDynamicIconSets.mockReturnValue([SETS[2]]);
    mockBuildAllFonts.mockResolvedValue([]);

    await main(silentLogger());

    expect(mockLoadDynamicIconSets).toHaveBeenCalledWith(app);
    expect(mockBuildAllFonts).toHaveBeenCalledWith(
      [SETS[2]],
      app,
      expect.anything()
    );
  });

  test('--app-config reads and builds in the current directory by default', async () => {
    process.argv = ['node', 'cli', '--dynamic', '--app-config'];
    mockLoadDynamicSetsFromAppConfig.mockReturnValue([SETS[2]]);
    mockBuildAllFonts.mockResolvedValue([]);

    await main(silentLogger());

    expect(mockLoadDynamicSetsFromAppConfig).toHaveBeenCalledWith(
      process.cwd()
    );
    expect(mockBuildAllFonts).toHaveBeenCalledWith(
      [SETS[2]],
      process.cwd(),
      expect.anything()
    );
  });

  test('--app-config with --path to an app folder reads and builds there', async () => {
    const app = makeFolder(true);
    process.argv = ['node', 'cli', '--dynamic', '--app-config', '--path', app];
    mockLoadDynamicSetsFromAppConfig.mockReturnValue([SETS[2]]);
    mockBuildAllFonts.mockResolvedValue([]);

    await main(silentLogger());

    expect(mockLoadDynamicSetsFromAppConfig).toHaveBeenCalledWith(app);
    expect(mockBuildAllFonts).toHaveBeenCalledWith(
      [SETS[2]],
      app,
      expect.anything()
    );
    expect(mockLinkBare).not.toHaveBeenCalled();
  });

  test('--dynamic builds only dynamic sets and never links', async () => {
    process.argv = ['node', 'cli', '--dynamic'];
    mockLoadDynamicIconSets.mockReturnValue([SETS[2]]);
    mockBuildAllFonts.mockResolvedValue([]);

    await main(silentLogger());

    expect(mockBuildAllFonts).toHaveBeenCalledWith(
      [SETS[2]],
      process.cwd(),
      expect.anything()
    );
    expect(mockLinkBare).not.toHaveBeenCalled();
  });
});
