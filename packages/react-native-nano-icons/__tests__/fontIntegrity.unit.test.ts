const mockIsFontRegistered = jest.fn<Promise<boolean>, [string]>();

jest.mock('../src/specs/NativeNanoIconsFontLoader', () => ({
  __esModule: true,
  default: {
    registerFont: jest.fn(),
    isFontRegistered: (family: string) => mockIsFontRegistered(family),
  },
}));

import {
  checkFontIntegrity,
  addFontIntegrityListener,
  getFontIntegrityIssues,
  isFontMismatch,
  reportFontMismatch,
  FONT_MISMATCH_CODE,
  __resetFontIntegrityForTests,
} from '../src/fontIntegrity';

let warn: jest.SpyInstance;

beforeEach(() => {
  __resetFontIntegrityForTests();
  mockIsFontRegistered.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('checkFontIntegrity', () => {
  test('a registered font leaves no trace', async () => {
    mockIsFontRegistered.mockResolvedValue(true);
    await checkFontIntegrity('Icons-1a2b3c4d', 'static');
    expect(warn).not.toHaveBeenCalled();
    expect(getFontIntegrityIssues()).toEqual([]);
  });

  test('a missing font warns with the configured name and one remedy', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    await checkFontIntegrity('Icons-1a2b3c4d', 'static');
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]![0] as string;
    expect(message).toMatch(/^🔬 react-native-nano-icons ⚠ Icon font "Icons"/);
    expect(message).not.toContain('1a2b3c4d');
    expect(message).toMatch(/render blank.*Regenerate the icon fonts/);
  });

  test('a missing font is recorded as an issue with both names', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    await checkFontIntegrity('Icons-1a2b3c4d', 'dynamic');
    expect(getFontIntegrityIssues()).toEqual([
      expect.objectContaining({
        fontFamily: 'Icons',
        family: 'Icons-1a2b3c4d',
        linking: 'dynamic',
      }),
    ]);
  });

  test('listeners are notified, late subscribers get the replay', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    const early = jest.fn();
    addFontIntegrityListener(early);
    await checkFontIntegrity('Icons-1a2b3c4d', 'static');
    const late = jest.fn();
    const unsubscribe = addFontIntegrityListener(late);
    expect(early).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledTimes(1);
    expect(late.mock.calls[0]![0]).toEqual(early.mock.calls[0]![0]);

    unsubscribe();
    await checkFontIntegrity('Other-0badf00d', 'static');
    expect(late).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledTimes(2);
  });

  test('checks once per family', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    await checkFontIntegrity('Icons-1a2b3c4d', 'static');
    await checkFontIntegrity('Icons-1a2b3c4d', 'static');
    expect(mockIsFontRegistered).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('a native binary without the check reports once that the app must be rebuilt', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loader = jest.requireMock('../src/specs/NativeNanoIconsFontLoader')
      .default as { isFontRegistered?: unknown };
    const original = loader.isFontRegistered;
    delete loader.isFontRegistered;
    try {
      await checkFontIntegrity('Icons-1a2b3c4d', 'static');
      await checkFontIntegrity('Other-0badf00d', 'dynamic');
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0]![0]).toBe(
        '🔬 react-native-nano-icons ✖ The app binary was built with an older version of react-native-nano-icons. Rebuild the app.'
      );
    } finally {
      loader.isFontRegistered = original;
      error.mockRestore();
    }
    expect(warn).not.toHaveBeenCalled();
    expect(getFontIntegrityIssues()).toEqual([]);
  });
});

describe('reportFontMismatch', () => {
  test('recognises the native mismatch code only', () => {
    expect(isFontMismatch({ code: FONT_MISMATCH_CODE })).toBe(true);
    expect(isFontMismatch({ code: 'E_NANOICONS_FONT_REGISTER' })).toBe(false);
    expect(isFontMismatch(new Error('boom'))).toBe(false);
    expect(isFontMismatch(null)).toBe(false);
  });

  test('warns with the delivery remedy and records the issue', () => {
    const seen = jest.fn();
    addFontIntegrityListener(seen);
    reportFontMismatch('Icons-1a2b3c4d', 'dynamic');
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]![0] as string;
    expect(message).toMatch(
      /^🔬 react-native-nano-icons ⚠ Icon font "Icons" does not match its glyphmap.*deliver the \.ttf together with its \.glyphmap\.json\.$/
    );
    expect(message).not.toContain('1a2b3c4d');
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({
        fontFamily: 'Icons',
        family: 'Icons-1a2b3c4d',
        linking: 'dynamic',
      })
    );
    expect(getFontIntegrityIssues()).toHaveLength(1);
  });
});
