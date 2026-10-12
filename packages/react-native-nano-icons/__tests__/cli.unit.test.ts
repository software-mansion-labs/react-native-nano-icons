/** @jest-environment node */

const mockBuildAllFonts = jest.fn();
const mockLinkBare = jest.fn();
const mockLoadNanoIconsConfig = jest.fn();
const mockLoadDynamicIconSets = jest.fn();
const mockLoadDynamicSetsFromAppConfig = jest.fn();
const mockCreateOraLogger = jest.fn();
const mockBuildAllSymbols = jest.fn();
const mockLinkBareSymbols = jest.fn();
const mockLinkBareAndroidDrawables = jest.fn();

jest.mock('../cli/index', () => ({
  IconSetBuildError: jest.requireActual('../cli/build').IconSetBuildError,
  SymbolSetBuildError: jest.requireActual('../cli/buildSymbols')
    .SymbolSetBuildError,
  buildAllSymbols: (...args: unknown[]) => mockBuildAllSymbols(...args),
  linkBareSymbols: (...args: unknown[]) => mockLinkBareSymbols(...args),
  linkBareAndroidDrawables: (...args: unknown[]) =>
    mockLinkBareAndroidDrawables(...args),
  buildAllFonts: (...args: unknown[]) => mockBuildAllFonts(...args),
  linkBare: (...args: unknown[]) => mockLinkBare(...args),
  loadNanoIconsConfig: (...args: unknown[]) => mockLoadNanoIconsConfig(...args),
  loadDynamicIconSets: (...args: unknown[]) => mockLoadDynamicIconSets(...args),
  loadDynamicSetsFromAppConfig: (...args: unknown[]) =>
    mockLoadDynamicSetsFromAppConfig(...args),
  createOraLogger: (...args: unknown[]) => mockCreateOraLogger(...args),
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IconSetBuildError } from '../cli/build';
import type { NanoLogger } from '../cli/logger';
import {
  CliUsageError,
  USAGE,
  main,
  parseCliArgs,
  runCli,
} from '../scripts/cli';

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

function runMain(): Promise<void> {
  return main(silentLogger(), parseCliArgs(process.argv.slice(2)));
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

    await runMain();

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

    await expect(runMain()).rejects.toBe(error);

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

    await runMain().catch(() => order.push('throw'));

    expect(order).toEqual(['build', 'link', 'throw']);
  });

  test('any other error skips linking entirely', async () => {
    mockBuildAllFonts.mockRejectedValue(
      new Error('Input directory does not exist')
    );

    await expect(runMain()).rejects.toThrow('Input directory does not exist');
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
      configRoot,
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

    await runMain();

    expectFullRun(process.cwd(), process.cwd());
  });

  test('--path to an app folder reads, builds and links there', async () => {
    const app = makeFolder(true);
    process.argv = ['node', 'cli', '--path', app];
    mockBuildAllFonts.mockResolvedValue(BUILT);

    await runMain();

    expectFullRun(app, app);
  });

  test("--path to an app's .nanoicons.json means that app", async () => {
    const app = makeFolder(true);
    process.argv = ['node', 'cli', '--path', path.join(app, '.nanoicons.json')];
    mockBuildAllFonts.mockResolvedValue(BUILT);

    await runMain();

    expectFullRun(app, app);
  });

  test('--path to a config folder resolves the config paths there and links in the current directory', async () => {
    const configFolder = makeFolder(false);
    process.argv = ['node', 'cli', '--path', configFolder];
    mockBuildAllFonts.mockResolvedValue(BUILT);

    await runMain();

    expectFullRun(configFolder, process.cwd());
  });

  test('--path to a .nanoicons.json outside an app folder resolves its paths there and keeps the current directory as the app', async () => {
    const configFolder = makeFolder(false);
    process.argv = [
      'node',
      'cli',
      '--path',
      path.join(configFolder, '.nanoicons.json'),
    ];
    mockBuildAllFonts.mockResolvedValue(BUILT);

    await runMain();

    expectFullRun(configFolder, process.cwd());
  });

  test('--dynamic with --path to a config folder resolves the paths there', async () => {
    const configFolder = makeFolder(false);
    process.argv = ['node', 'cli', '--dynamic', '--path', configFolder];
    mockLoadDynamicIconSets.mockReturnValue([SETS[2]]);
    mockBuildAllFonts.mockResolvedValue([]);

    await runMain();

    expect(mockLoadDynamicIconSets).toHaveBeenCalledWith(configFolder);
    expect(mockBuildAllFonts).toHaveBeenCalledWith(
      [SETS[2]],
      configFolder,
      expect.anything()
    );
  });

  test('symbol sets resolve against the config folder and link in the app', async () => {
    const configFolder = makeFolder(false);
    process.argv = ['node', 'cli', '--path', configFolder];
    const symbolSets = [{ inputDir: 'tabs' }];
    const builtSymbols = [{ name: 'tabs' }];
    mockLoadNanoIconsConfig.mockReturnValue({ symbolSets });
    mockBuildAllSymbols.mockResolvedValue(builtSymbols);
    mockLinkBareSymbols.mockResolvedValue(undefined);
    mockLinkBareAndroidDrawables.mockResolvedValue(undefined);

    await runMain();

    expect(mockBuildAllSymbols).toHaveBeenCalledWith(
      symbolSets,
      configFolder,
      expect.anything()
    );
    expect(mockLinkBareSymbols).toHaveBeenCalledWith(
      process.cwd(),
      builtSymbols,
      expect.anything()
    );
    expect(mockLinkBareAndroidDrawables).toHaveBeenCalledWith(
      process.cwd(),
      builtSymbols,
      expect.anything()
    );
  });

  test('--dynamic-app-config with --path to a config folder still reads and builds in the app', async () => {
    const configFolder = makeFolder(false);
    process.argv = [
      'node',
      'cli',
      '--dynamic-app-config',
      '--path',
      configFolder,
    ];
    mockLoadDynamicSetsFromAppConfig.mockReturnValue([SETS[2]]);
    mockBuildAllFonts.mockResolvedValue([]);

    await runMain();

    expect(mockLoadDynamicSetsFromAppConfig).toHaveBeenCalledWith(
      process.cwd()
    );
    expect(mockBuildAllFonts).toHaveBeenCalledWith(
      [SETS[2]],
      process.cwd(),
      expect.anything()
    );
  });

  test('--dynamic with --path to an app folder reads and builds there', async () => {
    const app = makeFolder(true);
    process.argv = ['node', 'cli', '--dynamic', '--path', app];
    mockLoadDynamicIconSets.mockReturnValue([SETS[2]]);
    mockBuildAllFonts.mockResolvedValue([]);

    await runMain();

    expect(mockLoadDynamicIconSets).toHaveBeenCalledWith(app);
    expect(mockBuildAllFonts).toHaveBeenCalledWith(
      [SETS[2]],
      app,
      expect.anything()
    );
  });

  test('--dynamic-app-config reads and builds in the current directory by default', async () => {
    process.argv = ['node', 'cli', '--dynamic-app-config'];
    mockLoadDynamicSetsFromAppConfig.mockReturnValue([SETS[2]]);
    mockBuildAllFonts.mockResolvedValue([]);

    await runMain();

    expect(mockLoadDynamicSetsFromAppConfig).toHaveBeenCalledWith(
      process.cwd()
    );
    expect(mockBuildAllFonts).toHaveBeenCalledWith(
      [SETS[2]],
      process.cwd(),
      expect.anything()
    );
  });

  test('--dynamic-app-config with --path to an app folder reads and builds there', async () => {
    const app = makeFolder(true);
    process.argv = ['node', 'cli', '--dynamic-app-config', '--path', app];
    mockLoadDynamicSetsFromAppConfig.mockReturnValue([SETS[2]]);
    mockBuildAllFonts.mockResolvedValue([]);

    await runMain();

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

    await runMain();

    expect(mockBuildAllFonts).toHaveBeenCalledWith(
      [SETS[2]],
      process.cwd(),
      expect.anything()
    );
    expect(mockLinkBare).not.toHaveBeenCalled();
  });
});

describe('parseCliArgs', () => {
  test('no arguments gives the defaults', () => {
    expect(parseCliArgs([])).toEqual({
      dynamic: false,
      appConfig: false,
      verbose: false,
      help: false,
    });
  });

  test('reads every flag', () => {
    expect(
      parseCliArgs([
        '--path',
        'apps/mobile',
        '--dynamic-app-config',
        '--verbose',
      ])
    ).toEqual({
      path: 'apps/mobile',
      dynamic: true,
      appConfig: true,
      verbose: true,
      help: false,
    });
  });

  test('--path accepts an inline value, even one starting with a dash', () => {
    expect(parseCliArgs(['--path=apps/mobile']).path).toBe('apps/mobile');
    expect(parseCliArgs(['--path=-odd-folder']).path).toBe('-odd-folder');
  });

  test.each([['--help'], ['-h']])('%s asks for help', (flag) => {
    expect(parseCliArgs([flag]).help).toBe(true);
  });

  test('help wins over anything else on the line', () => {
    expect(parseCliArgs(['--bogus', 'extra', '--help']).help).toBe(true);
    expect(parseCliArgs(['--app-config', '-h']).help).toBe(true);
  });

  test('--dynamic alone reads .nanoicons.json', () => {
    expect(parseCliArgs(['--dynamic'])).toMatchObject({
      dynamic: true,
      appConfig: false,
    });
  });

  test.each([
    [['--dyanmic'], 'Unknown option --dyanmic.'],
    [['-x'], 'Unknown option -x.'],
    [['build'], 'Unexpected argument "build".'],
    [['--', '--dynamic'], 'Unexpected argument "--dynamic".'],
    [['--path'], '--path needs a value.'],
    [['--path', '--dynamic'], '--path needs a value.'],
    [['--path', 'a', '--path', 'b'], '--path is given more than once.'],
    [['--dynamic', '--dynamic'], '--dynamic is given more than once.'],
    [['--dynamic=yes'], '--dynamic does not take a value.'],
    [
      ['--app-config'],
      'Unknown option --app-config. Use --dynamic-app-config instead.',
    ],
    [
      ['--dynamic', '--app-config'],
      'Unknown option --app-config. Use --dynamic-app-config instead.',
    ],
    [
      ['--dynamic', '--dynamic-app-config'],
      '--dynamic and --dynamic-app-config cannot be used together.',
    ],
  ])('%j is rejected', (args, message) => {
    expect(() => parseCliArgs(args)).toThrow(new CliUsageError(message));
  });
});

describe('runCli', () => {
  const tempDirs: string[] = [];
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;
  let logger: NanoLogger & { fail: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    stdout = jest.spyOn(console, 'log').mockImplementation(() => {});
    stderr = jest.spyOn(console, 'error').mockImplementation(() => {});
    logger = { ...silentLogger(), fail: jest.fn() };
    mockCreateOraLogger.mockResolvedValue(logger);
    mockLoadNanoIconsConfig.mockReturnValue({ iconSets: SETS });
    mockBuildAllFonts.mockResolvedValue(BUILT);
    mockLinkBare.mockResolvedValue(undefined);
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--help prints the usage and builds nothing', async () => {
    await expect(runCli(['--help'])).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(USAGE);
    expect(stderr).not.toHaveBeenCalled();
    expect(mockCreateOraLogger).not.toHaveBeenCalled();
    expect(mockBuildAllFonts).not.toHaveBeenCalled();
    expect(mockLinkBare).not.toHaveBeenCalled();
  });

  test('the usage lists every option the parser accepts', () => {
    for (const flag of [
      '--path',
      '--dynamic',
      '--dynamic-app-config',
      '--verbose',
      '--help',
      '-h',
    ]) {
      expect(USAGE).toContain(flag);
    }
  });

  test('an unknown option prints the error and the usage, and builds nothing', async () => {
    await expect(runCli(['--dyanmic'])).resolves.toBe(1);

    expect(stderr).toHaveBeenCalledWith(
      `Unknown option --dyanmic.\n\n${USAGE}`
    );
    expect(mockCreateOraLogger).not.toHaveBeenCalled();
    expect(mockBuildAllFonts).not.toHaveBeenCalled();
    expect(mockLinkBare).not.toHaveBeenCalled();
  });

  test('the old --app-config flag points to --dynamic-app-config and builds nothing', async () => {
    await expect(runCli(['--dynamic', '--app-config'])).resolves.toBe(1);

    expect(stderr).toHaveBeenCalledWith(
      `Unknown option --app-config. Use --dynamic-app-config instead.\n\n${USAGE}`
    );
    expect(mockLoadDynamicSetsFromAppConfig).not.toHaveBeenCalled();
    expect(mockLoadNanoIconsConfig).not.toHaveBeenCalled();
    expect(mockBuildAllFonts).not.toHaveBeenCalled();
  });

  test('--verbose picks the verbose logger', async () => {
    await runCli(['--verbose']);

    expect(mockCreateOraLogger).toHaveBeenCalledWith('verbose');
  });

  test('a successful run exits with 0', async () => {
    await expect(runCli([])).resolves.toBe(0);

    expect(mockCreateOraLogger).toHaveBeenCalledWith('normal');
    expect(mockLinkBare).toHaveBeenCalled();
    expect(logger.fail).not.toHaveBeenCalled();
  });

  test('a failed build reports the error and exits with 1', async () => {
    mockBuildAllFonts.mockRejectedValue(
      new Error('Input directory does not exist')
    );

    await expect(runCli([])).resolves.toBe(1);

    expect(logger.fail).toHaveBeenCalledWith('Input directory does not exist');
  });

  test('--path to a file other than .nanoicons.json is a usage error', async () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'nano-cli-'))
    );
    tempDirs.push(dir);
    const file = path.join(dir, 'icons.json');
    fs.writeFileSync(file, '{}');

    await expect(runCli(['--path', file])).resolves.toBe(1);

    expect(logger.fail).toHaveBeenCalledWith(
      `--path must be a folder or a .nanoicons.json file, got ${file}.\n\n${USAGE}`
    );
    expect(mockLoadNanoIconsConfig).not.toHaveBeenCalled();
    expect(mockBuildAllFonts).not.toHaveBeenCalled();
  });
});
