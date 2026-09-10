/** @jest-environment node */

const mockCoreBuildAllFonts = jest.fn();
const mockWarnings: string[] = [];

jest.mock('../cli/index', () => ({
  buildAllFonts: (...args: unknown[]) => mockCoreBuildAllFonts(...args),
  createQuietLogger: async () => ({
    start: () => {},
    update: () => {},
    succeed: () => {},
    fail: () => {},
    info: () => {},
    warn: (msg: string) => mockWarnings.push(msg),
  }),
  detectExpoLogLevel: () => 'normal',
}));

import { buildAllFonts, getOrBuildFonts } from '../plugin/src/buildFonts';

describe('Expo plugin buildAllFonts', () => {
  beforeEach(() => {
    mockCoreBuildAllFonts.mockReset();
    mockWarnings.length = 0;
  });

  test('a broken icon set fails the prebuild instead of returning no fonts', async () => {
    mockCoreBuildAllFonts.mockRejectedValue(
      new Error('1 icon set failed to build: DxTest')
    );

    await expect(buildAllFonts([], '/tmp')).rejects.toThrow(
      '1 icon set failed to build: DxTest'
    );
    expect(mockWarnings).toEqual([]);
  });

  test('platform mods share one build, so a failure is raised once and never retried', async () => {
    mockCoreBuildAllFonts.mockRejectedValue(
      new Error('1 icon set failed to build: DxTest')
    );

    const ios = getOrBuildFonts('/tmp', []);
    const android = getOrBuildFonts('/tmp', []);

    await expect(ios).rejects.toThrow('DxTest');
    await expect(android).rejects.toThrow('DxTest');
    expect(mockCoreBuildAllFonts).toHaveBeenCalledTimes(1);
  });

  test('a healthy run returns the built fonts', async () => {
    mockCoreBuildAllFonts.mockResolvedValue([{ fontFamily: 'Ok' }]);
    await expect(buildAllFonts([], '/tmp')).resolves.toEqual([
      { fontFamily: 'Ok' },
    ]);
    expect(mockWarnings).toEqual([]);
  });
});
