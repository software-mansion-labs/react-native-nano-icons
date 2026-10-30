jest.mock('../src/devServerFont.web', () => ({
  loadFontFromDevServer: () => Promise.resolve(false),
}));

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { createIconSet } from '../src/createNanoIconsSet.web';
import {
  addFontIntegrityListener,
  getFontIntegrityIssues,
  useFontIntegrityIssue,
  __resetFontIntegrityForTests,
  type FontIntegrityIssue,
} from '../src/fontIntegrity.web';
import { __resetWebFontsForTests } from '../src/webFont';

type Face = { family: string; status: string; loaded: Promise<unknown> };

class FakeFontFaceSet {
  faces: Face[] = [];
  private errorListeners: (() => void)[] = [];
  forEach(callback: (face: Face) => void): void {
    this.faces.forEach(callback);
  }
  add(face: Face): void {
    this.faces.push(face);
  }
  addEventListener(type: string, listener: () => void): void {
    if (type === 'loadingerror') this.errorListeners.push(listener);
  }
  fail(family: string, cause: unknown): void {
    this.faces.push(face(family, 'error', cause));
    for (const listener of this.errorListeners) listener();
  }
}

function face(family: string, status: string, cause?: unknown): Face {
  const loaded =
    status === 'error' ? Promise.reject(cause) : Promise.resolve(undefined);
  loaded.catch(() => {});
  return { family, status, loaded };
}

const glyphMap = {
  m: { f: 'Ui-0123abcd', u: 1024, z: 1020, s: 0xe900, h: '0123abcdef' },
  i: { heart: [1024, [[0xe900, 'black']]] },
} as const;

const FAMILY = 'Ui-0123abcd';
const MESSAGE =
  '🔬 react-native-nano-icons ⚠ Icon font "Ui" could not be loaded, so its icons will render blank. Check that its font url serves a valid font file.';

const load = jest.fn<Promise<void>, []>();
const g = globalThis as { FontFace?: unknown; document?: unknown };
let fonts: FakeFontFaceSet;
let warn: jest.SpyInstance;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  __resetFontIntegrityForTests();
  __resetWebFontsForTests();
  load.mockReset().mockResolvedValue(undefined);
  fonts = new FakeFontFaceSet();
  g.document = { fonts };
  g.FontFace = class {
    status = 'loaded';
    loaded = Promise.resolve(undefined);
    constructor(public family: string) {}
    load = load;
  };
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete g.document;
  delete g.FontFace;
  warn.mockRestore();
});

describe('font faces of the document', () => {
  test('a face of the set that failed before the set was created is recorded with its cause', async () => {
    const cause = new Error('A network error occurred.');
    fonts.add(face('"Ui"', 'error', cause));
    createIconSet(glyphMap, '/fonts/Ui.woff2');
    await settle();
    expect(getFontIntegrityIssues()).toEqual([
      {
        fontFamily: 'Ui',
        family: FAMILY,
        linking: 'static',
        message: MESSAGE.replace('🔬 react-native-nano-icons ⚠ ', ''),
        cause,
      },
    ]);
    expect(warn).toHaveBeenCalledWith(MESSAGE, cause);
  });

  test('a face that fails later is recorded on loadingerror, once', async () => {
    const seen = jest.fn();
    addFontIntegrityListener(seen);
    createIconSet({ ...glyphMap, m: { ...glyphMap.m, l: 'd' } });
    await settle();
    expect(getFontIntegrityIssues()).toEqual([]);

    fonts.fail('Other', new Error('other font'));
    fonts.fail('Ui', new Error('404'));
    fonts.fail('Ui', new Error('404'));
    await settle();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ family: FAMILY, linking: 'dynamic' }),
      'found'
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('a family with a loaded face is not recorded', async () => {
    fonts.add(face(FAMILY, 'loaded'));
    createIconSet(glyphMap, '/fonts/Ui.woff2');
    fonts.fail('Ui', new Error('404'));
    await settle();
    expect(getFontIntegrityIssues()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('loadFont', () => {
  test('a failed load is recorded with its cause and rejects, a later load resolves it', async () => {
    const seen = jest.fn();
    addFontIntegrityListener(seen);
    const Icon = createIconSet(glyphMap);
    const cause = new Error('A network error occurred.');
    load.mockRejectedValueOnce(cause);

    await expect(Icon.loadFont('/missing.woff2')).rejects.toBe(cause);
    const [issue] = getFontIntegrityIssues();
    expect(issue).toMatchObject({ family: FAMILY, cause });

    await Icon.loadFont('/fonts/Ui.woff2');
    expect(getFontIntegrityIssues()).toEqual([]);
    expect(seen.mock.calls).toEqual([
      [issue, 'found'],
      [issue, 'resolved'],
    ]);
  });

  test('a late listener gets the current issue', async () => {
    load.mockRejectedValueOnce(new Error('404'));
    await expect(
      createIconSet(glyphMap).loadFont('/missing.woff2')
    ).rejects.toThrow('404');
    const late = jest.fn();
    addFontIntegrityListener(late);
    expect(late).toHaveBeenCalledWith(
      expect.objectContaining({ family: FAMILY }),
      'found'
    );
  });

  test('a failed retry is not recorded while a face of the family is loaded', async () => {
    fonts.add(face('Ui', 'loaded'));
    load.mockRejectedValueOnce(new Error('404'));
    await expect(
      createIconSet(glyphMap).loadFont('/other.woff2')
    ).rejects.toThrow('404');
    expect(getFontIntegrityIssues()).toEqual([]);
  });
});

describe('useFontIntegrityIssue', () => {
  type Renderer = {
    act(callback: () => void | Promise<void>): Promise<void>;
    create(element: ReturnType<typeof createElement>): unknown;
  };
  const TestRenderer = require('react-test-renderer') as Renderer;

  test('re-renders when the issue of its family is found and resolved', async () => {
    const seen: (FontIntegrityIssue | undefined)[] = [];
    function Probe(): null {
      seen.push(useFontIntegrityIssue(FAMILY));
      return null;
    }
    const Icon = createIconSet(glyphMap, '/fonts/Ui.woff2');
    await TestRenderer.act(() => {
      TestRenderer.create(createElement(Probe));
    });
    expect(seen).toEqual([undefined]);

    await TestRenderer.act(async () => {
      fonts.fail('Ui', new Error('404'));
      await settle();
    });
    expect(seen.at(-1)).toMatchObject({ family: FAMILY });

    await TestRenderer.act(() => Icon.loadFont());
    expect(seen.at(-1)).toBeUndefined();
  });
});

describe('outside a browser', () => {
  test('on the server nothing is watched or recorded, and the hook renders', async () => {
    delete g.document;
    delete g.FontFace;
    const Icon = createIconSet(glyphMap, '/fonts/Ui.woff2');
    await expect(Icon.loadFont()).rejects.toThrow('FontFace API unavailable');
    await settle();

    let issue: FontIntegrityIssue | undefined | null = null;
    function Probe(): null {
      issue = useFontIntegrityIssue(FAMILY);
      return null;
    }
    expect(renderToString(createElement(Probe))).toBe('');
    expect(issue).toBeUndefined();
    expect(getFontIntegrityIssues()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  test('without document.fonts and FontFace nothing throws or is recorded', async () => {
    g.document = {};
    delete g.FontFace;
    const Icon = createIconSet(glyphMap, '/fonts/Ui.woff2');
    await expect(Icon.loadFont()).rejects.toThrow('FontFace API unavailable');
    await settle();
    expect(getFontIntegrityIssues()).toEqual([]);
  });
});
