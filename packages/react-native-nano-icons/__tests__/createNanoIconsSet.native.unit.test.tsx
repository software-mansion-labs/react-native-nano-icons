import { createElement, type ReactElement } from 'react';
import { PixelRatio, StyleSheet, UIManager } from 'react-native';

jest.mock('../src/specs/NanoIconViewNativeComponent', () => ({
  __esModule: true,
  default: 'NanoIconView',
}));
jest.mock('../src/specs/NativeNanoIconsFontLoader', () => ({
  __esModule: true,
  default: {
    isFontRegistered: jest.fn(async () => true),
    loadFont: jest.fn(async () => {}),
  },
}));
jest.mock('../src/devServerFont', () => ({
  loadFontFromDevServer: jest.fn(async () => false),
}));
jest.mock('../src/loadDynamicFont', () => ({
  loadDynamicFont: jest.fn(async () => {}),
  useDynamicFontPending: () => false,
}));

jest.spyOn(UIManager, 'hasViewManagerConfig').mockReturnValue(true);

const { createIconSet } =
  require('../src/createNanoIconsSet.native') as typeof import('../src/createNanoIconsSet.native');
const { createJSIconSet } =
  require('../src/createNanoIconsSet.shared') as typeof import('../src/createNanoIconsSet.shared');

type HostNode = { type: unknown; props: Record<string, unknown> };
type TestRendererModule = {
  act(callback: () => void): void;
  create(element: ReactElement): {
    root: { findAll(predicate: (node: HostNode) => boolean): HostNode[] };
    update(element: ReactElement): void;
  };
};
const TestRenderer = require('react-test-renderer') as TestRendererModule;

const glyphMap = {
  m: { f: 'Ui-0123abcd', u: 1024, z: 1020, s: 0xe900, h: '0123abcdef' },
  i: {
    message: [1024, [[0xe900, 'currentColor']]],
    badge: [
      1024,
      [
        [0xe901, '#ff0000'],
        [0xe902, 'currentColor'],
      ],
    ],
    wide: [2044, [[0xe903, 'black']]],
  },
} as const;

const Icon = createIconSet(glyphMap);

type IconElementProps = Parameters<typeof Icon>[0];

function nativeProps(props: IconElementProps): Record<string, unknown> {
  let tree!: ReturnType<TestRendererModule['create']>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(createElement(Icon, { size: 24, ...props }));
  });
  const nodes = tree.root.findAll((node) => node.type === 'NanoIconView');
  expect(nodes).toHaveLength(1);
  return nodes[0]!.props;
}

function nativeColors(props: IconElementProps): unknown {
  return nativeProps(props)['colors'];
}

describe('createIconSet (native) layer colors', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  test('currentColor layers render black when no color is given', () => {
    expect(nativeColors({ name: 'message' })).toEqual(['black']);
    expect(nativeColors({ name: 'badge' })).toEqual(['#ff0000', 'black']);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('a single color replaces every layer', () => {
    expect(nativeColors({ name: 'badge', color: 'red' })).toEqual([
      'red',
      'red',
    ]);
  });

  test('tintMode currentColor keeps hardcoded fills and tints the rest', () => {
    expect(
      nativeColors({ name: 'badge', color: 'red', tintMode: 'currentColor' })
    ).toEqual(['#ff0000', 'red']);
    expect(nativeColors({ name: 'badge', tintMode: 'currentColor' })).toEqual([
      '#ff0000',
      'black',
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('passes size and the font scale to native and leaves sizing to the shadow node', () => {
    const props = nativeProps({
      name: 'badge',
      size: 30,
      allowFontScaling: false,
    });
    expect(props['size']).toBe(30);
    expect(props['fontScale']).toBe(1);
    expect(nativeProps({ name: 'badge' })['fontScale']).toBe(
      PixelRatio.getFontScale()
    );
    expect(props['advanceWidth']).toBe(1024);
    expect(props['unitsPerEm']).toBe(1024);
    expect(props['style']).toBeUndefined();
  });

  test('the square frame sends the scale that fits the longer side of the glyph', () => {
    expect(nativeProps({ name: 'wide' })['squareGlyphScale']).toBeUndefined();
    expect(
      nativeProps({ name: 'wide', frame: 'fit-glyph' })['squareGlyphScale']
    ).toBeUndefined();
    expect(
      nativeProps({ name: 'badge', frame: 'square' })['squareGlyphScale']
    ).toBe(1);
    expect(
      nativeProps({ name: 'wide', frame: 'square' })['squareGlyphScale']
    ).toBe(0.5);
  });

  test('sends the tintable layer indices for the tint mode', () => {
    expect(nativeProps({ name: 'badge' })['tintLayers']).toEqual([0, 1]);
    expect(
      nativeProps({ name: 'badge', tintMode: 'currentColor' })['tintLayers']
    ).toEqual([1]);
  });

  test('an empty color array falls back to the glyphmap defaults', () => {
    expect(nativeColors({ name: 'badge', color: [] })).toEqual([
      '#ff0000',
      'black',
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('an invalid color string falls back to black and names the icon', () => {
    expect(nativeColors({ name: 'message', color: 'nope' })).toEqual(['black']);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain(
      'Invalid color "nope" for icon "message" (layer 0)'
    );
  });
});

describe.each([
  ['native', () => createIconSet(glyphMap), 'NanoIconView'],
  ['JS fallback', () => createJSIconSet(glyphMap), 'View'],
])('createIconSet (%s) props', (_, create, hostType) => {
  const Icon = create();

  function mount(props: IconElementProps) {
    let tree!: ReturnType<TestRendererModule['create']>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(createElement(Icon, props));
    });
    return {
      host: () => tree.root.findAll((node) => node.type === hostType)[0]!.props,
      update: (next: IconElementProps) =>
        TestRenderer.act(() => tree.update(createElement(Icon, next))),
    };
  }

  test('an icon without a label is hidden from screen readers', () => {
    const props = mount({ name: 'message' }).host();
    expect(props).toMatchObject({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(props['accessibilityLabel']).toBeUndefined();
    expect(props['accessibilityRole']).toBeUndefined();
  });

  test('a label makes the icon an image with that label', () => {
    const props = mount({
      name: 'message',
      accessibilityLabel: 'Message',
    }).host();
    expect(props).toMatchObject({
      accessibilityLabel: 'Message',
      accessibilityRole: 'image',
    });
    expect(props['accessible']).toBeUndefined();
    expect(props['accessibilityElementsHidden']).toBeUndefined();
  });

  test('a changed accessibility prop re-renders the icon', () => {
    const icon = mount({ name: 'message', accessibilityLabel: 'First' });
    icon.update({ name: 'message', accessibilityLabel: 'Second' });
    expect(icon.host()['accessibilityLabel']).toBe('Second');
    icon.update({
      name: 'message',
      accessibilityLabel: 'Second',
      accessible: false,
    });
    expect(icon.host()['accessible']).toBe(false);
  });

  test('a new style array with the same values does not re-render', () => {
    const icon = mount({ name: 'message', style: [{ margin: 4 }] });
    const before = icon.host();
    icon.update({ name: 'message', style: [{ margin: 4 }] });
    expect(icon.host()).toBe(before);
    icon.update({ name: 'message', style: [{ margin: 5 }] });
    expect(icon.host()).not.toBe(before);
  });
});

describe('createJSIconSet square frame', () => {
  const Icon = createJSIconSet(glyphMap);

  function render(props: IconElementProps) {
    let tree!: ReturnType<TestRendererModule['create']>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(createElement(Icon, props));
    });
    const style = (type: string) =>
      tree.root
        .findAll((node) => node.type === type)
        .map((node) => StyleSheet.flatten(node.props['style'] as never));
    return { box: style('View')[0], layers: style('Text') };
  }

  test('the box is as wide as it is high', () => {
    const { box } = render({
      name: 'wide',
      size: 24,
      frame: 'square',
      allowFontScaling: false,
    });
    expect(box).toMatchObject({ width: 24, height: 24 });
  });

  test('the glyph is scaled to fit and centered', () => {
    const { layers } = render({
      name: 'wide',
      size: 24,
      frame: 'square',
      allowFontScaling: false,
    });
    expect(layers[0]).toMatchObject({
      fontSize: 12,
      left: '50%',
      bottom: '50%',
      marginLeft: -11.9765625,
      marginBottom: -6,
    });
  });

  test('the glyph is centered in a box set by the style', () => {
    const { layers } = render({
      name: 'wide',
      size: 24,
      frame: 'square',
      allowFontScaling: false,
      style: { width: 40, height: 40 },
    });
    const layer = layers[0]!;
    const offset = (inset: unknown, margin: unknown) =>
      (parseFloat(String(inset)) / 100) * 40 + Number(margin ?? 0);
    const glyphHeight = Number(layer.fontSize);
    const glyphWidth = (glyphHeight * 2044) / 1024;
    expect(offset(layer.left, layer.marginLeft) + glyphWidth / 2).toBeCloseTo(
      20
    );
    expect(
      offset(layer.bottom, layer.marginBottom) + glyphHeight / 2
    ).toBeCloseTo(20);
  });
});
