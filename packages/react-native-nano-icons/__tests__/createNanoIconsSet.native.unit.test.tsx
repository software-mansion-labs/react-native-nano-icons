import { act, create } from 'react-test-renderer';
import { PixelRatio } from 'react-native';
import type { ElementType } from 'react';

const NativeIconView = 'NanoIconViewNative' as unknown as ElementType;

jest.mock('../src/specs/NanoIconViewNativeComponent', () => ({
  __esModule: true,
  default: NativeIconView,
}));

jest.mock('../src/specs/NativeNanoIconsFontLoader', () => ({
  __esModule: true,
  default: null,
}));

jest.mock('react-native', () => {
  return {
    PixelRatio: { getFontScale: jest.fn(() => 1.5) },
    UIManager: {
      hasViewManagerConfig: jest.fn(() => true),
    },
    View: 'View',
    Text: 'Text',
    Platform: {
      select: ({ default: fallback }: { default: string }) => fallback,
    },
    processColor: jest.fn(() => 0xff000000),
  };
});

import { createIconSet } from '../src/createNanoIconsSet.native';

const mockGetFontScale = PixelRatio.getFontScale as jest.Mock;

const glyphMap = {
  m: { f: 'TestFont', u: 1000, z: 0, s: 0 },
  i: { home: [600, [[100, 'black']]] },
} as const;

describe('native icon font scaling', () => {
  beforeEach(() => {
    mockGetFontScale.mockReturnValue(1.5);
  });

  afterEach(() => mockGetFontScale.mockReset());

  function renderIcon(props: { allowFontScaling?: boolean } = {}) {
    const Icon = createIconSet(glyphMap);
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Icon name="home" size={20} {...props} />);
    });
    return renderer!.root.findByType(NativeIconView).props;
  }

  test('passes a font size scaled with the native icon bounds', () => {
    const props = renderIcon();

    expect(props.fontSize).toBe(30);
    expect(props.iconHeight).toBe(30);
    expect(props.iconWidth).toBe(18);
  });

  test('does not scale the native font when scaling is disabled', () => {
    const props = renderIcon({ allowFontScaling: false });

    expect(props.fontSize).toBe(20);
    expect(props.iconHeight).toBe(20);
    expect(props.iconWidth).toBe(12);
  });

  test('shrinks the native font with its bounds at a reduced font scale', () => {
    mockGetFontScale.mockReturnValue(0.75);

    const props = renderIcon();

    expect(props.fontSize).toBe(15);
    expect(props.iconHeight).toBe(15);
    expect(props.iconWidth).toBe(9);
  });

  test('preserves the unscaled size at the default font scale', () => {
    mockGetFontScale.mockReturnValue(1);

    const props = renderIcon();

    expect(props.fontSize).toBe(20);
    expect(props.iconHeight).toBe(20);
  });
});
