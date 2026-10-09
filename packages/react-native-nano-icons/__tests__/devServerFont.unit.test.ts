const mockIsFontRegistered = jest.fn<Promise<boolean>, [string]>();
const mockRegisterFont = jest.fn<Promise<boolean>, [string, string]>();

jest.mock('../src/specs/NativeNanoIconsFontLoader', () => ({
  __esModule: true,
  default: {
    registerFont: (...args: [string, string]) => mockRegisterFont(...args),
    isFontRegistered: (family: string) => mockIsFontRegistered(family),
  },
}));

import { TurboModuleRegistry } from 'react-native';
import { devServerFontUri, loadFontFromDevServer } from '../src/devServerFont';
import { __resetDynamicFontsForTests } from '../src/loadDynamicFont';
import { __resetFontIntegrityForTests } from '../src/fontIntegrity';

const FAMILY = 'Icons-1a2b3c4d';
const URI = 'http://192.168.1.10:8081/__nanoicons/Icons-1a2b3c4d.ttf';

const fetchMock = jest.fn<Promise<{ ok: boolean }>, [string, RequestInit?]>();
const mockSource: { scriptURL: string | null } = { scriptURL: null };

beforeEach(() => {
  __resetDynamicFontsForTests();
  __resetFontIntegrityForTests();
  mockIsFontRegistered.mockReset().mockResolvedValue(false);
  mockRegisterFont.mockReset().mockResolvedValue(true);
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  const get = TurboModuleRegistry.get;
  jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((name: string) =>
    name === 'SourceCode'
      ? ({
          getConstants: () => ({ scriptURL: mockSource.scriptURL }),
        } as never)
      : get(name)
  );
  mockSource.scriptURL =
    'http://192.168.1.10:8081/index.bundle?platform=ios&dev=true';
});

afterEach(() => jest.restoreAllMocks());

test('the font url is built from the bundle origin', () => {
  expect(devServerFontUri(FAMILY)).toBe(URI);
  mockSource.scriptURL = null;
  expect(devServerFontUri(FAMILY)).toBeUndefined();
});

test('registers the font served by the dev server', async () => {
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(true);
  expect(fetchMock).toHaveBeenCalledWith(URI, { method: 'HEAD' });
  expect(mockRegisterFont).toHaveBeenCalledWith(FAMILY, URI);
});

test('a resident font is left alone', async () => {
  mockIsFontRegistered.mockResolvedValue(true);
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockRegisterFont).not.toHaveBeenCalled();
});

test('without the metro plugin nothing is registered', async () => {
  fetchMock.mockResolvedValue({ ok: false });
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(false);
  expect(mockRegisterFont).not.toHaveBeenCalled();
});

test('a bundle not served over http gives up quietly', async () => {
  mockSource.scriptURL = null;
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('network and registration failures report false', async () => {
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(false);

  mockRegisterFont.mockRejectedValueOnce(new Error('Invalid font data'));
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(false);
});
