import {
  DEFAULT_ICON_SIZE,
  resolveGlyphEntry,
  createCharCache,
  createLayerColorResolver,
  tintableLayers,
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

    const mixedLayers: [number, string][] = [
      [1, '#f00'],
      [2, 'currentColor'],
      [3, '#00f'],
      [4, 'currentColor'],
    ];
    const resolveAll = (
      resolve: (index: number, srcColor: string | undefined) => unknown
    ) => mixedLayers.map(([, src], i) => resolve(i, src));

    test('tintMode currentColor tints only currentColor layers with a single color', () => {
      const resolve = createLayerColorResolver(
        'red',
        'currentColor',
        mixedLayers
      );
      expect(resolveAll(resolve)).toEqual(['#f00', 'red', '#00f', 'red']);
    });

    test('tintMode currentColor maps array entries onto currentColor layers in order', () => {
      expect(
        resolveAll(
          createLayerColorResolver(
            ['teal', 'pink'],
            'currentColor',
            mixedLayers
          )
        )
      ).toEqual(['#f00', 'teal', '#00f', 'pink']);
      expect(
        resolveAll(
          createLayerColorResolver(['a', 'b', 'c'], 'currentColor', mixedLayers)
        )
      ).toEqual(['#f00', 'a', '#00f', 'b']);
    });

    test('a one-element array behaves like a single color in both modes', () => {
      for (const mode of ['all', 'currentColor'] as const) {
        expect(
          resolveAll(createLayerColorResolver(['red'], mode, mixedLayers))
        ).toEqual(
          resolveAll(createLayerColorResolver('red', mode, mixedLayers))
        );
      }
    });

    test('tintMode currentColor without a color falls back to source colors', () => {
      for (const color of [undefined, []]) {
        expect(
          resolveAll(
            createLayerColorResolver(color, 'currentColor', mixedLayers)
          )
        ).toEqual(['#f00', 'currentColor', '#00f', 'currentColor']);
      }
    });

    test('tintMode currentColor repeats the last array color over the remaining currentColor layers', () => {
      const layers: [number, string][] = [
        [1, 'currentColor'],
        [2, '#f00'],
        [3, 'currentColor'],
        [4, 'currentColor'],
      ];
      const resolve = createLayerColorResolver(
        ['teal', 'pink'],
        'currentColor',
        layers
      );
      expect(layers.map(([, src], i) => resolve(i, src))).toEqual([
        'teal',
        '#f00',
        'pink',
        'pink',
      ]);
    });

    test('tintMode currentColor leaves an icon without currentColor layers untouched', () => {
      const layers: [number, string][] = [
        [1, '#f00'],
        [2, '#00f'],
      ];
      for (const color of ['red', ['red'], ['red', 'blue']]) {
        const resolve = createLayerColorResolver(color, 'currentColor', layers);
        expect(layers.map(([, src], i) => resolve(i, src))).toEqual([
          '#f00',
          '#00f',
        ]);
      }
    });
  });

  describe('tintableLayers', () => {
    const layers: [number, string][] = [
      [1, '#f00'],
      [2, 'currentColor'],
      [3, '#00f'],
      [4, 'currentColor'],
    ];

    test('all mode lists every layer', () => {
      expect(tintableLayers(layers)).toEqual([0, 1, 2, 3]);
      expect(tintableLayers(layers, 'all')).toBe(tintableLayers(layers));
    });

    test('currentColor mode lists only currentColor layers', () => {
      expect(tintableLayers(layers, 'currentColor')).toEqual([1, 3]);
      expect(tintableLayers([[1, '#f00']], 'currentColor')).toEqual([]);
    });
  });
});
