import {
  areIconPropsEqual,
  shallowEqualStyle,
} from '../src/utils/iconPropsEqual';

describe('shallowEqualStyle', () => {
  test('equal objects and nested arrays with new identities are equal', () => {
    const base = { margin: 4 };
    expect(shallowEqualStyle({ margin: 4 }, { margin: 4 })).toBe(true);
    expect(
      shallowEqualStyle(
        [base, [{ opacity: 0.5 }, false]],
        [base, [{ opacity: 0.5 }, false]]
      )
    ).toBe(true);
    expect(shallowEqualStyle(undefined, undefined)).toBe(true);
  });

  test('a changed, added or removed value is not equal', () => {
    expect(shallowEqualStyle({ margin: 4 }, { margin: 5 })).toBe(false);
    expect(shallowEqualStyle({ margin: 4 }, { margin: 4, padding: 1 })).toBe(
      false
    );
    expect(
      shallowEqualStyle(
        { margin: 4, padding: undefined },
        { margin: 4, top: 1 }
      )
    ).toBe(false);
    expect(shallowEqualStyle([{ margin: 4 }], [{ margin: 4 }, {}])).toBe(false);
    expect(shallowEqualStyle([{ margin: 4 }], { margin: 4 })).toBe(false);
    expect(shallowEqualStyle({ margin: 4 }, null)).toBe(false);
  });

  test('values are compared by identity, one level deep', () => {
    expect(
      shallowEqualStyle(
        { transform: [{ rotate: '90deg' }] },
        { transform: [{ rotate: '90deg' }] }
      )
    ).toBe(false);
  });
});

describe('areIconPropsEqual', () => {
  test('style and color are compared shallowly', () => {
    expect(
      areIconPropsEqual(
        { name: 'a', style: [{ margin: 4 }], color: ['red', 'blue'] },
        { name: 'a', style: [{ margin: 4 }], color: ['red', 'blue'] }
      )
    ).toBe(true);
  });

  test('every other prop is compared', () => {
    const prev = { name: 'a', accessibilityLabel: 'First' };
    expect(
      areIconPropsEqual(prev, { name: 'a', accessibilityLabel: 'Second' })
    ).toBe(false);
    expect(areIconPropsEqual(prev, { ...prev, accessible: false })).toBe(false);
    expect(
      areIconPropsEqual({ name: 'a', testID: 'x' }, { name: 'a', testID: 'y' })
    ).toBe(false);
    expect(
      areIconPropsEqual(
        { name: 'a', ref: () => {} },
        { name: 'a', ref: () => {} }
      )
    ).toBe(false);
  });

  test('a prop present on one side only is a change', () => {
    expect(
      areIconPropsEqual(
        { name: 'a', size: undefined },
        { name: 'a', testID: undefined }
      )
    ).toBe(false);
  });
});
