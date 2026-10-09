const mockLoadDynamicFont = jest.fn<Promise<void>, [string, unknown]>();
const mockGetFontStatus = jest.fn<string | undefined, [string]>();

jest.mock('../src/loadDynamicFont', () => ({
  loadDynamicFont: (...args: [string, unknown]) => mockLoadDynamicFont(...args),
  getFontStatus: (family: string) => mockGetFontStatus(family),
}));

import {
  devServerFontUri,
  loadFontFromDevServer,
} from '../src/devServerFont.web';

const FAMILY = 'Icons-1a2b3c4d';
const URI = 'http://localhost:8081/__nanoicons/Icons-1a2b3c4d.ttf';

const fetchMock = jest.fn<Promise<{ ok: boolean }>, [string, RequestInit?]>();
const g = globalThis as { fetch: unknown; location?: unknown };

beforeEach(() => {
  mockLoadDynamicFont.mockReset().mockResolvedValue(undefined);
  mockGetFontStatus.mockReset().mockReturnValue(undefined);
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  g.fetch = fetchMock;
  g.location = { origin: 'http://localhost:8081' };
});

afterEach(() => {
  delete g.location;
});

test('the font url is built from the page origin', () => {
  expect(devServerFontUri(FAMILY)).toBe(URI);
  delete g.location;
  expect(devServerFontUri(FAMILY)).toBeUndefined();
});

test('registers the font served by the dev server under the hashed family', async () => {
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(true);
  expect(fetchMock).toHaveBeenCalledWith(URI, { method: 'HEAD' });
  expect(mockLoadDynamicFont).toHaveBeenCalledWith(FAMILY, { uri: URI });
});

test('a font that is already ready is left alone', async () => {
  mockGetFontStatus.mockReturnValue('ready');
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('without the metro plugin, or outside a browser, nothing is registered', async () => {
  fetchMock.mockResolvedValue({ ok: false });
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(false);
  delete g.location;
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(false);
  expect(mockLoadDynamicFont).not.toHaveBeenCalled();
});

test('a failed registration reports false', async () => {
  mockLoadDynamicFont.mockRejectedValue(new Error('bad font'));
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(false);
});
