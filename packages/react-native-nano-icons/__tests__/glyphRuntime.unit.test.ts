import {
  DEFAULT_ICON_SIZE,
  resolveGlyphEntry,
  createCharCache,
  createLayerColorResolver,
} from '../src/utils/glyphRuntime';

const glyphMap = {
  m: { f: 'TestFont', u: 1000, z: 0, s: 0 },
  i: {
    home: [
      600,
      [
        [100, 'red'],
        [101, 'blue'],
      ],
    ],
  } as Record<string, readonly unknown[]>,
};

describe('glyphRuntime', () => {
  test('DEFAULT_ICON_SIZE is 12', () => {
    expect(DEFAULT_ICON_SIZE).toBe(12);
  });

  describe('resolveGlyphEntry', () => {
    test('returns the entry for a known name', () => {
      expect(resolveGlyphEntry(glyphMap, 'home')).toEqual([
        600,
        [
          [100, 'red'],
          [101, 'blue'],
        ],
      ]);
    });

    test('falls back to a single ? layer (codepoint 63) sized to units-per-em for an unknown name', () => {
      expect(resolveGlyphEntry(glyphMap, 'missing')).toEqual([
        1000,
        [[63, 'black']],
      ]);
    });
  });

  describe('createCharCache', () => {
    test('converts codepoints to chars, including the astral plane', () => {
      const getChar = createCharCache();
      expect(getChar(63)).toBe('?');
      expect(getChar(65)).toBe('A');
      expect(getChar(0x1f600)).toBe(String.fromCodePoint(0x1f600));
    });

    test('returns a stable value across repeated calls (memoized)', () => {
      const getChar = createCharCache();
      expect(getChar(65)).toBe('A');
      expect(getChar(65)).toBe('A');
    });
  });

  describe('createLayerColorResolver', () => {
    test('a single color spills onto every layer', () => {
      const resolve = createLayerColorResolver('red');
      expect(resolve(0, 'srcA')).toBe('red');
      expect(resolve(5, 'srcB')).toBe('red');
    });

    test('array colors map per index, last color spills to the remaining layers', () => {
      const resolve = createLayerColorResolver(['red', 'blue']);
      expect(resolve(0, 'srcA')).toBe('red');
      expect(resolve(1, 'srcA')).toBe('blue');
      expect(resolve(2, 'srcA')).toBe('blue');
    });

    test('undefined color falls back to the glyph source color', () => {
      const resolve = createLayerColorResolver(undefined);
      expect(resolve(0, 'srcColor')).toBe('srcColor');
    });

    test('falls back to black when neither palette nor source color is available', () => {
      const resolve = createLayerColorResolver(undefined);
      expect(resolve(0, undefined)).toBe('black');
    });

    test('an empty color array falls through to source color, then black', () => {
      const resolve = createLayerColorResolver([]);
      expect(resolve(0, 'srcColor')).toBe('srcColor');
      expect(resolve(0, undefined)).toBe('black');
    });
  });
});
