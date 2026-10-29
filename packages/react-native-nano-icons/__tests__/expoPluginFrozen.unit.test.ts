/** @jest-environment node */

const mockCoreBuildAllFonts = jest.fn();
const mockCoreBuildAllSymbols = jest.fn();
const mockCheckAllFonts = jest.fn();
const mockCheckAllSymbols = jest.fn();

jest.mock('../cli/index', () => ({
  buildAllFonts: (...args: unknown[]) => mockCoreBuildAllFonts(...args),
  buildAllSymbols: (...args: unknown[]) => mockCoreBuildAllSymbols(...args),
  checkAllFonts: (...args: unknown[]) => mockCheckAllFonts(...args),
  checkAllSymbols: (...args: unknown[]) => mockCheckAllSymbols(...args),
  createQuietLogger: async () => ({
    start: () => {},
    update: () => {},
    succeed: () => {},
    fail: () => {},
    info: () => {},
    warn: () => {},
  }),
  detectExpoLogLevel: () => 'normal',
}));

import { buildAllFonts } from '../plugin/src/buildFonts';
import { buildAllSymbols } from '../plugin/src/buildSymbols';

const ICON_SETS = [{ inputDir: './icons', fontFamily: 'Icons' }];
const SYMBOL_SETS = [{ inputDir: './tabs', name: 'tabs' }];
const ENV_CI = process.env.CI;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.CI;
  mockCheckAllFonts.mockResolvedValue([]);
  mockCheckAllSymbols.mockResolvedValue([]);
  mockCoreBuildAllFonts.mockResolvedValue([{ fontFamily: 'Icons' }]);
  mockCoreBuildAllSymbols.mockResolvedValue([{ name: 'tabs' }]);
});

afterAll(() => {
  if (ENV_CI === undefined) delete process.env.CI;
  else process.env.CI = ENV_CI;
});

describe('frozen prebuild', () => {
  test('out-of-date icon sets fail the prebuild with their reasons, and nothing is built', async () => {
    mockCheckAllFonts.mockResolvedValue([
      { name: 'Icons', reason: 'Icons.ttf is missing' },
      {
        name: 'Other',
        reason: 'its SVGs, options or installed versions changed',
      },
    ]);

    await expect(buildAllFonts(ICON_SETS, '/app', true)).rejects.toThrow(
      '[react-native-nano-icons] frozen is on, but 2 sets are out of date: Icons (Icons.ttf is missing), Other (its SVGs, options or installed versions changed). Rebuild them without frozen, e.g. with a local prebuild, and commit the generated files.'
    );
    expect(mockCheckAllFonts).toHaveBeenCalledWith(ICON_SETS, '/app', {
      existingOnly: false,
    });
    expect(mockCoreBuildAllFonts).not.toHaveBeenCalled();
  });

  test('an out-of-date symbol set fails the prebuild, and nothing is built', async () => {
    mockCheckAllSymbols.mockResolvedValue([
      { name: 'tabs', reason: 'tabs.symbolmap.json is missing' },
    ]);

    await expect(buildAllSymbols(SYMBOL_SETS, '/app', true)).rejects.toThrow(
      '[react-native-nano-icons] frozen is on, but 1 set is out of date: tabs (tabs.symbolmap.json is missing). Rebuild them without frozen, e.g. with a local prebuild, and commit the generated files.'
    );
    expect(mockCheckAllSymbols).toHaveBeenCalledWith(SYMBOL_SETS, '/app', {
      existingOnly: false,
    });
    expect(mockCoreBuildAllSymbols).not.toHaveBeenCalled();
  });

  test('up-to-date sets go through the build, which links what is on disk', async () => {
    await expect(buildAllFonts(ICON_SETS, '/app', true)).resolves.toEqual([
      { fontFamily: 'Icons' },
    ]);
    await expect(buildAllSymbols(SYMBOL_SETS, '/app', true)).resolves.toEqual([
      { name: 'tabs' },
    ]);
    expect(mockCheckAllFonts).toHaveBeenCalledTimes(1);
    expect(mockCheckAllSymbols).toHaveBeenCalledTimes(1);
  });

  test.each(['true', '1'])(
    'unset, it checks the sets with generated files when CI is %s',
    async (ci) => {
      process.env.CI = ci;
      mockCheckAllFonts.mockResolvedValue([
        { name: 'Icons', reason: 'its linking changed to "dynamic"' },
      ]);

      await expect(buildAllFonts(ICON_SETS, '/app')).rejects.toThrow(
        'frozen is on, but 1 set is out of date: Icons (its linking changed to "dynamic")'
      );
      await buildAllSymbols(SYMBOL_SETS, '/app');

      expect(mockCheckAllFonts).toHaveBeenCalledWith(ICON_SETS, '/app', {
        existingOnly: true,
      });
      expect(mockCheckAllSymbols).toHaveBeenCalledWith(SYMBOL_SETS, '/app', {
        existingOnly: true,
      });
      expect(mockCoreBuildAllFonts).not.toHaveBeenCalled();
      expect(mockCoreBuildAllSymbols).toHaveBeenCalledTimes(1);
    }
  );

  test.each([
    ['CI is not set', undefined, undefined],
    ['CI is false', 'false', undefined],
    ['CI is FALSE', 'FALSE', undefined],
    ['CI is 0', '0', undefined],
    ['frozen is false in CI', 'true', false],
  ])(
    'nothing is checked and stale sets are rebuilt when %s',
    async (_label, ci, frozen) => {
      if (ci !== undefined) process.env.CI = ci;

      await buildAllFonts(ICON_SETS, '/app', frozen);
      await buildAllSymbols(SYMBOL_SETS, '/app', frozen);

      expect(mockCheckAllFonts).not.toHaveBeenCalled();
      expect(mockCheckAllSymbols).not.toHaveBeenCalled();
      expect(mockCoreBuildAllFonts).toHaveBeenCalledTimes(1);
      expect(mockCoreBuildAllSymbols).toHaveBeenCalledTimes(1);
    }
  );
});
