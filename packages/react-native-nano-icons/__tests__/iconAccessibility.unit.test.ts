import { iconAccessibilityProps } from '../src/utils/iconAccessibility';

describe('iconAccessibilityProps', () => {
  test('an icon without a label is hidden from screen readers', () => {
    expect(iconAccessibilityProps({})).toEqual({
      accessible: false,
      accessibilityLabel: undefined,
      accessibilityRole: undefined,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(iconAccessibilityProps({ accessibilityLabel: '' })).toMatchObject({
      accessible: false,
      accessibilityElementsHidden: true,
    });
  });

  test('a label makes the icon an image with that label', () => {
    expect(iconAccessibilityProps({ accessibilityLabel: 'Warning' })).toEqual({
      accessible: undefined,
      accessibilityLabel: 'Warning',
      accessibilityRole: 'image',
      accessibilityElementsHidden: undefined,
      importantForAccessibility: undefined,
    });
  });

  test('accessible without a label exposes the icon', () => {
    expect(iconAccessibilityProps({ accessible: true })).toMatchObject({
      accessible: true,
      accessibilityRole: 'image',
      accessibilityElementsHidden: undefined,
    });
  });

  test('an explicit opt-in without a label exposes the icon', () => {
    expect(
      iconAccessibilityProps({ importantForAccessibility: 'yes' })
    ).toEqual({
      accessible: undefined,
      accessibilityLabel: undefined,
      accessibilityRole: 'image',
      accessibilityElementsHidden: undefined,
      importantForAccessibility: 'yes',
    });
    expect(
      iconAccessibilityProps({ accessibilityElementsHidden: false })
    ).toMatchObject({
      accessible: undefined,
      accessibilityElementsHidden: false,
      importantForAccessibility: undefined,
    });
    expect(
      iconAccessibilityProps({ accessibilityRole: 'button' })
    ).toMatchObject({
      accessible: undefined,
      accessibilityRole: 'button',
      accessibilityElementsHidden: undefined,
      importantForAccessibility: undefined,
    });
  });

  test('the none role keeps an icon without a label hidden', () => {
    expect(iconAccessibilityProps({ accessibilityRole: 'none' })).toMatchObject(
      { accessible: false, accessibilityElementsHidden: true }
    );
  });

  test('explicit props win over the defaults', () => {
    expect(
      iconAccessibilityProps({
        accessibilityRole: 'button',
        accessibilityElementsHidden: false,
        importantForAccessibility: 'auto',
      })
    ).toMatchObject({
      accessibilityRole: 'button',
      accessibilityElementsHidden: false,
      importantForAccessibility: 'auto',
    });
    expect(
      iconAccessibilityProps({
        accessibilityLabel: 'Warning',
        accessible: false,
      })
    ).toMatchObject({ accessible: false, accessibilityLabel: 'Warning' });
  });
});
