jest.mock('../src/specs/NativeNanoIconsFontLoader', () => ({
  __esModule: true,
  default: null,
}));

import {
  checkFontIntegrity,
  getFontIntegrityIssues,
  reportDynamicFontLoadFailure,
  reportMissingDynamicFont,
} from '../src/fontIntegrity';

test('without the native module nothing is checked or recorded', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await checkFontIntegrity('Icons-1a2b3c4d', 'static');
  expect(warn).not.toHaveBeenCalled();
  expect(getFontIntegrityIssues()).toEqual([]);
  warn.mockRestore();
});

test('without the native module dynamic font problems only warn in dev', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const cause = new Error('Native font loader is unavailable');
  await reportMissingDynamicFont('Icons-1a2b3c4d');
  await reportDynamicFontLoadFailure('Icons-1a2b3c4d', cause);
  expect(warn).toHaveBeenCalledTimes(2);
  expect(warn.mock.calls[1]![1]).toBe(cause);
  expect(getFontIntegrityIssues()).toEqual([]);
  warn.mockRestore();
});
