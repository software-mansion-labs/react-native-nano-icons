/** @jest-environment node */

import { nativeNanoSymbol as iosNanoSymbol } from '../src/symbols/index.ios';
import { nativeNanoSymbol as androidNanoSymbol } from '../src/symbols/index.android';

describe('nativeNanoSymbol', () => {
  test('iOS returns an sfSymbol descriptor, monochrome by default', () => {
    expect(iosNanoSymbol('home')).toEqual({
      type: 'sfSymbol',
      name: 'nano.home',
      renderingMode: 'monochrome',
    });
    expect(iosNanoSymbol('home', 'multicolor', 'brand')).toEqual({
      type: 'sfSymbol',
      name: 'brand.home',
      renderingMode: 'multicolor',
    });
  });

  test('Android picks the drawable by renderingMode and sets tinted', () => {
    expect(androidNanoSymbol('person-walking')).toEqual({
      type: 'image',
      source: { uri: 'nano_person_walking' },
      tinted: true,
    });
    expect(androidNanoSymbol('home', 'multicolor', 'brand')).toEqual({
      type: 'image',
      source: { uri: 'brand_home_original' },
      tinted: false,
    });
  });
});
