import {
  __resetWebFontsForTests,
  isWebFontRegistered,
  registerWebFont,
  webFontUrl,
} from '../src/webFont';

type Face = { family: string; source: string; descriptors: unknown };

const added: Face[] = [];
const load = jest.fn<Promise<void>, []>();
const g = globalThis as { FontFace?: unknown; document?: unknown };

beforeEach(() => {
  __resetWebFontsForTests();
  added.length = 0;
  load.mockReset().mockResolvedValue(undefined);
  g.FontFace = class {
    constructor(
      public family: string,
      public source: string,
      public descriptors: unknown
    ) {}
    load = load;
  };
  g.document = { fonts: { add: (face: Face) => added.push(face) } };
});

afterEach(() => {
  delete g.FontFace;
  delete g.document;
});

test('urls come from a string or an { uri }', () => {
  expect(webFontUrl('/a.woff2')).toBe('/a.woff2');
  expect(webFontUrl({ uri: '/b.ttf' })).toBe('/b.ttf');
  expect(webFontUrl(42)).toBeUndefined();
  expect(webFontUrl(undefined)).toBeUndefined();
});

test('a font is loaded with font-display block and added to the document', async () => {
  await registerWebFont('Ui', '/a.woff2');
  expect(added).toEqual([
    expect.objectContaining({
      family: 'Ui',
      source: 'url("/a.woff2")',
      descriptors: { display: 'block' },
    }),
  ]);
  expect(isWebFontRegistered('Ui')).toBe(true);
});

test('a url already registered for the family is not added again', async () => {
  await registerWebFont('Ui', '/a.woff2');
  await registerWebFont('Ui', '/a.woff2');
  expect(added).toHaveLength(1);
  await registerWebFont('Ui', '/b.woff2');
  expect(added).toHaveLength(2);
});

test('a failed load is not marked as registered', async () => {
  load.mockRejectedValue(new Error('404'));
  await expect(registerWebFont('Ui', '/missing.woff2')).rejects.toThrow('404');
  expect(added).toEqual([]);
  expect(isWebFontRegistered('Ui')).toBe(false);
});

test('without the FontFace API the call rejects', async () => {
  delete g.FontFace;
  await expect(registerWebFont('Ui', '/a.woff2')).rejects.toThrow(
    'FontFace API unavailable'
  );
});
