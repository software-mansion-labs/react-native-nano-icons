jest.mock('../src/specs/NativeNanoIconsFontLoader', () => ({
  __esModule: true,
  default: null,
}));

import {
  checkFontIntegrity,
  getFontIntegrityIssues,
} from '../src/fontIntegrity';

test('without the native module nothing is checked or recorded', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await checkFontIntegrity('Icons-1a2b3c4d', 'static');
  expect(warn).not.toHaveBeenCalled();
  expect(getFontIntegrityIssues()).toEqual([]);
  warn.mockRestore();
});
