/** @jest-environment node */

jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    dim: (s: string) => `<dim>${s}</dim>`,
    red: (s: string) => `<red>${s}</red>`,
    yellow: (s: string) => `<yellow>${s}</yellow>`,
    green: (s: string) => `<green>${s}</green>`,
    blue: (s: string) => `<blue>${s}</blue>`,
  },
}));

const mockSpinner = {
  start: jest.fn(),
  succeed: jest.fn(),
  fail: jest.fn(),
  warn: jest.fn(),
  clear: jest.fn(),
  render: jest.fn(),
  isSpinning: false,
  text: '',
};
jest.mock('ora', () => ({ __esModule: true, default: () => mockSpinner }));

import { createOraLogger, createQuietLogger } from '../cli/logger';

describe('ora logger (CLI)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('warnings are dimmed like the prefix', async () => {
    (await createOraLogger('normal')).warn('careful');
    expect(mockSpinner.warn).toHaveBeenCalledWith('<dim>careful</dim>');
  });

  test('errors are red', async () => {
    (await createOraLogger('normal')).fail('broken');
    expect(mockSpinner.fail).toHaveBeenCalledWith('<red>broken</red>');
  });

  test('info is silent unless verbose', async () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    (await createOraLogger('normal')).info('detail');
    expect(write).not.toHaveBeenCalled();

    (await createOraLogger('verbose')).info('detail');
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('<dim>detail</dim>')
    );

    write.mockRestore();
  });
});

describe('quiet logger (Expo plugin)', () => {
  test('warnings keep a yellow marker and dim the text', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (await createQuietLogger('normal')).warn('careful');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('<yellow>⚠</yellow> <dim>careful</dim>')
    );
    warn.mockRestore();
  });

  test('errors are red, marker and text', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    (await createQuietLogger('normal')).fail('broken');
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('<red>✗</red> <red>broken</red>')
    );
    error.mockRestore();
  });

  test('info is silent unless verbose', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    (await createQuietLogger('normal')).info('detail');
    expect(log).not.toHaveBeenCalled();

    (await createQuietLogger('verbose')).info('detail');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('detail'));

    log.mockRestore();
  });
});
