import { Image } from 'react-native';

const mockRegisterFont = jest.fn<Promise<boolean>, [string, string]>();

jest.mock('../src/specs/NativeNanoIconsFontLoader', () => ({
  __esModule: true,
  default: {
    registerFont: (...args: [string, string]) => mockRegisterFont(...args),
  },
}));

import {
  resolveFontUri,
  loadDynamicFont,
  getFontStatus,
  __resetDynamicFontsForTests,
} from '../src/loadDynamicFont';

beforeEach(() => {
  __resetDynamicFontsForTests();
  mockRegisterFont.mockReset();
  mockRegisterFont.mockResolvedValue(true);
  jest
    .spyOn(Image, 'resolveAssetSource')
    .mockReturnValue({ uri: 'asset:/SWM.ttf', width: 0, height: 0, scale: 1 });
});

afterEach(() => jest.restoreAllMocks());

describe('resolveFontUri', () => {
  test('require()d module (number) → resolves via Image.resolveAssetSource', () => {
    expect(resolveFontUri(42)).toBe('asset:/SWM.ttf');
    expect(Image.resolveAssetSource).toHaveBeenCalledWith(42);
  });

  test('string path/uri → returned as-is', () => {
    expect(resolveFontUri('file:///fonts/X.ttf')).toBe('file:///fonts/X.ttf');
  });

  test('{ uri } object → returns the uri', () => {
    expect(resolveFontUri({ uri: 'https://cdn/X.ttf' })).toBe(
      'https://cdn/X.ttf'
    );
  });

  test.each([null, undefined, true, {}, { uri: 5 }])(
    'unsupported source %p → throws',
    (bad) => {
      expect(() => resolveFontUri(bad)).toThrow(/Unsupported font source/);
    }
  );
});

describe('loadDynamicFont', () => {
  test('registers the resolved uri under the family and marks it ready', async () => {
    await loadDynamicFont('SWM', { uri: 'file:///X.ttf' });

    expect(mockRegisterFont).toHaveBeenCalledTimes(1);
    expect(mockRegisterFont).toHaveBeenCalledWith('SWM', 'file:///X.ttf');
    expect(getFontStatus('SWM')).toBe('ready');
  });

  test('status is "loading" synchronously, then "ready" after resolve', async () => {
    const p = loadDynamicFont('SWM', 'file:///X.ttf');
    expect(getFontStatus('SWM')).toBe('loading');
    await p;
    expect(getFontStatus('SWM')).toBe('ready');
  });

  test('concurrent/repeated calls for one family dedupe to a single registration', async () => {
    const a = loadDynamicFont('SWM', 'file:///X.ttf');
    const b = loadDynamicFont('SWM', 'file:///OTHER.ttf');
    await Promise.all([a, b]);

    expect(mockRegisterFont).toHaveBeenCalledTimes(1);
    // First call wins; the second is a no-op returning the in-flight promise.
    expect(mockRegisterFont).toHaveBeenCalledWith('SWM', 'file:///X.ttf');
  });

  test('native failure → status "error" and the promise rejects', async () => {
    mockRegisterFont.mockRejectedValueOnce(new Error('boom'));

    await expect(loadDynamicFont('SWM', 'file:///X.ttf')).rejects.toThrow(
      'boom'
    );
    expect(getFontStatus('SWM')).toBe('error');
  });

  test('after an error a later call retries (no permanent in-flight lock)', async () => {
    mockRegisterFont.mockRejectedValueOnce(new Error('boom'));

    await expect(loadDynamicFont('SWM', 'file:///X.ttf')).rejects.toThrow(
      'boom'
    );
    expect(getFontStatus('SWM')).toBe('error');

    // Default mock resolves true → the retry should actually run and succeed.
    await loadDynamicFont('SWM', 'file:///X.ttf');

    expect(mockRegisterFont).toHaveBeenCalledTimes(2);
    expect(getFontStatus('SWM')).toBe('ready');
  });

  test('a ready font is not re-registered on a subsequent non-forced call', async () => {
    await loadDynamicFont('SWM', 'file:///X.ttf');
    expect(getFontStatus('SWM')).toBe('ready');

    await loadDynamicFont('SWM', 'file:///X.ttf');

    expect(mockRegisterFont).toHaveBeenCalledTimes(1);
  });

  test('force: true re-registers even when the family is already ready', async () => {
    await loadDynamicFont('SWM', 'file:///X.ttf');
    expect(getFontStatus('SWM')).toBe('ready');

    await loadDynamicFont('SWM', 'file:///OTHER.ttf', { force: true });

    expect(mockRegisterFont).toHaveBeenCalledTimes(2);
    expect(mockRegisterFont).toHaveBeenLastCalledWith(
      'SWM',
      'file:///OTHER.ttf'
    );
  });

  test('unresolvable source → status "error", native never called', async () => {
    await expect(loadDynamicFont('SWM', true)).rejects.toThrow(
      /Unsupported font source/
    );
    expect(mockRegisterFont).not.toHaveBeenCalled();
    expect(getFontStatus('SWM')).toBe('error');
  });
});
