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
    expect(iosNanoSymbol('home', 'original', 'brand')).toEqual({
      type: 'sfSymbol',
      name: 'brand.home',
      renderingMode: 'original',
    });
  });

  test('Android picks the monochrome or original drawable by renderingMode', () => {
    expect(androidNanoSymbol('person-walking')).toEqual({
      type: 'image',
      source: { uri: 'nano_person_walking' },
      renderingMode: 'monochrome',
    });
    expect(androidNanoSymbol('home', 'original', 'brand')).toEqual({
      type: 'image',
      source: { uri: 'brand_home_original' },
      renderingMode: 'original',
    });
  });
});
