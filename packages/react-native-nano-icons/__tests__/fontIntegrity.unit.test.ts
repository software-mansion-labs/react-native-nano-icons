const mockIsFontRegistered = jest.fn<Promise<boolean>, [string]>();
const mockRegisterFont = jest.fn<Promise<boolean>, [string, string]>();

jest.mock('../src/specs/NativeNanoIconsFontLoader', () => ({
  __esModule: true,
  default: {
    registerFont: (...args: [string, string]) => mockRegisterFont(...args),
    isFontRegistered: (family: string) => mockIsFontRegistered(family),
  },
}));

import {
  checkFontIntegrity,
  addFontIntegrityListener,
  getFontIntegrityIssues,
  isFontMismatch,
  reportDynamicFontLoadFailure,
  reportFontMismatch,
  reportMissingDynamicFont,
  FONT_MISMATCH_CODE,
  FONT_SOURCE_CODE,
  __resetFontIntegrityForTests,
} from '../src/fontIntegrity';
import { warnIfLinkingMismatch } from '../src/createNanoIconsSet.shared';
import {
  loadDynamicFont,
  __resetDynamicFontsForTests,
} from '../src/loadDynamicFont';

let warn: jest.SpyInstance;

beforeEach(() => {
  __resetFontIntegrityForTests();
  __resetDynamicFontsForTests();
  mockIsFontRegistered.mockReset();
  mockRegisterFont.mockReset();
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
      }),
      'found'
    );
    expect(getFontIntegrityIssues()).toHaveLength(1);
  });
});

describe('dynamic font issues', () => {
  test('a dynamic set without a font is recorded and warns with the configured name', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    await reportMissingDynamicFont('Icons-1a2b3c4d');
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]![0] as string;
    expect(message).toMatch(
      /^🔬 react-native-nano-icons ⚠ Icon font "Icons" is built with dynamic linking but no font was passed/
    );
    expect(message).not.toContain('1a2b3c4d');
    expect(getFontIntegrityIssues()).toEqual([
      expect.objectContaining({
        fontFamily: 'Icons',
        family: 'Icons-1a2b3c4d',
        linking: 'dynamic',
      }),
    ]);
  });

  test('a failed load is recorded, and the dev warning carries the cause', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    const cause = new Error('file not found');
    const seen = jest.fn();
    addFontIntegrityListener(seen);
    await reportDynamicFontLoadFailure('Icons-1a2b3c4d', cause);
    expect(warn).toHaveBeenCalledTimes(1);
    const [message, detail] = warn.mock.calls[0]! as [string, unknown];
    expect(message).toBe(
      '🔬 react-native-nano-icons ⚠ Icon font "Icons" could not be loaded: file not found. Its icons will render blank. Make sure the .ttf is delivered with your update.'
    );
    expect(detail).toBe(cause);
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ family: 'Icons-1a2b3c4d', linking: 'dynamic' }),
      'found'
    );
    expect(getFontIntegrityIssues()).toEqual([
      expect.objectContaining({ cause }),
    ]);
  });

  test('an unusable font source names the argument instead of the reason', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    const cause = Object.assign(new Error('Unsupported font source.'), {
      code: FONT_SOURCE_CODE,
    });
    await reportDynamicFontLoadFailure('Icons-1a2b3c4d', cause);
    expect(warn.mock.calls[0]![0]).toBe(
      '🔬 react-native-nano-icons ⚠ Icon font "Icons" has no usable font source, so its icons will render blank. Pass require("Icons.ttf") or { uri } to createNanoIconSet.'
    );
    expect(getFontIntegrityIssues()).toEqual([
      expect.objectContaining({ cause }),
    ]);
  });

  test('a font registered by other means leaves no trace', async () => {
    mockIsFontRegistered.mockResolvedValue(true);
    await reportMissingDynamicFont('Icons-1a2b3c4d');
    await reportDynamicFontLoadFailure('Icons-1a2b3c4d', new Error('boom'));
    expect(mockIsFontRegistered).toHaveBeenCalledWith('Icons-1a2b3c4d');
    expect(warn).not.toHaveBeenCalled();
    expect(getFontIntegrityIssues()).toEqual([]);
  });
});

describe('resolved issues', () => {
  test('a later successful load drops the issue and tells listeners', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    const seen = jest.fn();
    addFontIntegrityListener(seen);
    await reportDynamicFontLoadFailure('Icons-1a2b3c4d', new Error('boom'));
    const [issue] = getFontIntegrityIssues();

    mockRegisterFont.mockResolvedValue(true);
    await loadDynamicFont('Icons-1a2b3c4d', 'file:///Icons.ttf');

    expect(getFontIntegrityIssues()).toEqual([]);
    expect(seen.mock.calls).toEqual([
      [issue, 'found'],
      [issue, 'resolved'],
    ]);
  });

  test('a mismatch is dropped once the matching font loads', async () => {
    reportFontMismatch('Icons-1a2b3c4d', 'dynamic');
    mockRegisterFont.mockResolvedValue(true);
    await loadDynamicFont('Icons-1a2b3c4d', 'file:///Icons.ttf', {
      force: true,
    });
    expect(getFontIntegrityIssues()).toEqual([]);
  });

  test('a failed load keeps the issue', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    await reportMissingDynamicFont('Icons-1a2b3c4d');
    mockRegisterFont.mockRejectedValue(new Error('still missing'));
    await expect(
      loadDynamicFont('Icons-1a2b3c4d', 'file:///Icons.ttf')
    ).rejects.toThrow('still missing');
    expect(getFontIntegrityIssues()).toHaveLength(1);
  });

  test('only the loaded family is dropped', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    await checkFontIntegrity('Static-0badf00d', 'static');
    await reportMissingDynamicFont('Icons-1a2b3c4d');
    mockRegisterFont.mockResolvedValue(true);
    await loadDynamicFont('Icons-1a2b3c4d', 'file:///Icons.ttf');
    expect(getFontIntegrityIssues()).toEqual([
      expect.objectContaining({ family: 'Static-0badf00d' }),
    ]);
  });

  test('late subscribers get no replay of a resolved issue', async () => {
    reportFontMismatch('Icons-1a2b3c4d', 'dynamic');
    mockRegisterFont.mockResolvedValue(true);
    await loadDynamicFont('Icons-1a2b3c4d', 'file:///Icons.ttf');
    const late = jest.fn();
    addFontIntegrityListener(late);
    expect(late).not.toHaveBeenCalled();
  });
});

describe('warnIfLinkingMismatch', () => {
  test('a dynamic set without a font records an issue', async () => {
    mockIsFontRegistered.mockResolvedValue(false);
    warnIfLinkingMismatch('Icons-1a2b3c4d', 'd', undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getFontIntegrityIssues()).toEqual([
      expect.objectContaining({ family: 'Icons-1a2b3c4d', linking: 'dynamic' }),
    ]);
  });

  test('a static set given a font only warns', () => {
    warnIfLinkingMismatch('Icons-1a2b3c4d', undefined, 42);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(
      /Icon font "Icons" is built with static linking, so the font passed to createNanoIconSet is ignored\./
    );
    expect(getFontIntegrityIssues()).toEqual([]);
  });

  test('consistent arguments stay silent', () => {
    warnIfLinkingMismatch('Icons-1a2b3c4d', 'd', 42);
    warnIfLinkingMismatch('Icons-1a2b3c4d', undefined, undefined);
    expect(warn).not.toHaveBeenCalled();
    expect(getFontIntegrityIssues()).toEqual([]);
  });
});
