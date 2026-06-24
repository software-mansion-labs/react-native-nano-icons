/** @jest-environment node */

import { buildVectorDrawableXml } from '../src/core/symbols/vectorDrawable';
import { toDrawableResourceName } from '../src/utils/naming';

// ---------------------------------------------------------------------------
// toDrawableResourceName
// ---------------------------------------------------------------------------

describe('toDrawableResourceName', () => {
  test('dots and dashes become underscores, lowercased', () => {
    expect(toDrawableResourceName('nano.home')).toBe('nano_home');
    expect(toDrawableResourceName('nano.person-walking')).toBe(
      'nano_person_walking'
    );
    expect(toDrawableResourceName('nano.AO')).toBe('nano_ao');
  });

  test('prefixes a leading non-letter so the name is a valid resource id', () => {
    expect(toDrawableResourceName('123')).toMatch(/^nano_/);
    expect(/^[a-z][a-z0-9_]*$/.test(toDrawableResourceName('1.2'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildVectorDrawableXml
// ---------------------------------------------------------------------------

describe('buildVectorDrawableXml', () => {
  const viewBox: [number, number, number, number] = [0, 0, 24, 24];

  test('monochrome — black fills, regardless of source layer fills', () => {
    const xml = buildVectorDrawableXml({
      layers: [{ d: 'M0 0L10 0L10 10Z' }, { d: 'M2 2L8 2L8 8Z' }],
      multicolor: false,
      viewBox,
    });
    expect(xml).toContain('<vector');
    expect(xml).toContain('android:viewportWidth="24"');
    expect(xml).toContain('android:viewportHeight="24"');
    expect((xml.match(/android:fillColor="#000000"/g) ?? []).length).toBe(2);
    expect(xml).toContain('android:pathData="M0 0L10 0L10 10Z"');
  });

  test('multicolor — keeps each layer fill (with alpha)', () => {
    const xml = buildVectorDrawableXml({
      layers: [
        { d: 'M0 0L10 0L10 10Z', fill: '#ff0000' },
        { d: 'M2 2L8 2L8 8Z', fill: 'rgba(0,0,255,0.5)' },
      ],
      multicolor: true,
      viewBox,
    });
    expect(xml).toContain('android:fillColor="#ff0000"');
    expect(xml).toContain('android:fillColor="#0000ff"');
    expect(xml).toContain('android:fillAlpha="0.5"');
  });

  test('content bounds with origin are absorbed by a translating group', () => {
    const xml = buildVectorDrawableXml({
      layers: [{ d: 'M4 4L20 4L20 20Z' }],
      multicolor: false,
      viewBox,
      contentBounds: [4, 4, 16, 16],
    });
    expect(xml).toContain('android:viewportWidth="16"');
    expect(xml).toContain('android:viewportHeight="16"');
    expect(xml).toContain(
      '<group android:translateX="-4" android:translateY="-4">'
    );
  });
});
