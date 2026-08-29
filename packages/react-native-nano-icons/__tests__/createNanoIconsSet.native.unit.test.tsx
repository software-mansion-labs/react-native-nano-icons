import { act, create } from 'react-test-renderer';
import { PixelRatio, Platform } from 'react-native';
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
    PixelRatio: {
      get: jest.fn(() => 2),
      getFontScale: jest.fn(() => 1.5),
    },
    UIManager: {
      hasViewManagerConfig: jest.fn(() => true),
    },
    View: 'View',
    Text: 'Text',
    Platform: {
      OS: 'android',
      select: ({ default: fallback }: { default: string }) => fallback,
    },
    processColor: jest.fn(() => 0xff000000),
  };
});

import { createIconSet } from '../src/createNanoIconsSet.native';

const mockGetFontScale = PixelRatio.getFontScale as jest.Mock;
const mockGetDensity = PixelRatio.get as jest.Mock;
const mockPlatform = Platform as unknown as { OS: string };

const glyphMap = {
  m: { f: 'TestFont', u: 1000, z: 0, s: 0 },
  i: { home: [600, [[100, 'black']]] },
} as const;

describe('native icon font scaling', () => {
  beforeEach(() => {
    mockGetFontScale.mockReturnValue(1.5);
    mockGetDensity.mockReturnValue(2);
    mockPlatform.OS = 'android';
  });

  afterEach(() => {
    mockGetFontScale.mockReset();
    mockGetDensity.mockReset();
  });

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
    expect(props.style[0]).toEqual({ width: 18, height: 30 });
  });

  test('does not scale the native font when scaling is disabled', () => {
    const props = renderIcon({ allowFontScaling: false });

    expect(props.fontSize).toBe(20);
    expect(props.iconHeight).toBe(20);
    expect(props.iconWidth).toBe(12);
    expect(props.style[0]).toEqual({ width: 12, height: 20 });
  });

  test('rounds fractional Android layout bounds upward to physical pixels', () => {
    mockGetFontScale.mockReturnValue(1.3);
    mockGetDensity.mockReturnValue(2.75);

    const props = renderIcon();

    expect(props.fontSize).toBe(26);
    expect(props.iconHeight).toBe(26);
    expect(props.iconWidth).toBeCloseTo(15.6, 5);
    expect(props.style[0].height).toBeCloseTo(26.181818, 5);
    expect(props.style[0].width).toBeCloseTo(15.636364, 5);
  });

  test('does not grow Android layout bounds already on physical pixels', () => {
    mockGetFontScale.mockReturnValue(1.25);

    const props = renderIcon();

    expect(props.style[0]).toEqual({ width: 15, height: 25 });
  });

  test('ignores floating-point noise at a physical pixel boundary', () => {
    mockGetFontScale.mockReturnValue(1.2000000000000002);
    mockGetDensity.mockReturnValue(2.5);

    const props = renderIcon();

    expect(props.style[0].height).toBeCloseTo(24, 10);
    expect(props.style[0].width).toBeCloseTo(14.4, 10);
  });

  test('does not snap iOS layout bounds', () => {
    mockGetFontScale.mockReturnValue(1.3);
    mockGetDensity.mockReturnValue(2.75);
    mockPlatform.OS = 'ios';

    const props = renderIcon();

    expect(props.style[0]).toEqual({ width: 15.6, height: 26 });
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
