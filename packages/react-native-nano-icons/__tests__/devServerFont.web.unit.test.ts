const mockRegisterWebFont = jest.fn<Promise<void>, [string, string]>();
const mockIsWebFontRegistered = jest.fn<boolean, [string]>();

jest.mock('../src/webFont', () => ({
  registerWebFont: (...args: [string, string]) => mockRegisterWebFont(...args),
  isWebFontRegistered: (family: string) => mockIsWebFontRegistered(family),
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
  mockRegisterWebFont.mockReset().mockResolvedValue(undefined);
  mockIsWebFontRegistered.mockReset().mockReturnValue(false);
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
  expect(mockRegisterWebFont).toHaveBeenCalledWith(FAMILY, URI);
});

test('a font that is already registered is left alone', async () => {
  mockIsWebFontRegistered.mockReturnValue(true);
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('without the metro plugin, or outside a browser, nothing is registered', async () => {
  fetchMock.mockResolvedValue({ ok: false });
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(false);
  delete g.location;
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(false);
  expect(mockRegisterWebFont).not.toHaveBeenCalled();
});

test('a failed registration reports false', async () => {
  mockRegisterWebFont.mockRejectedValue(new Error('bad font'));
  await expect(loadFontFromDevServer(FAMILY)).resolves.toBe(false);
});
