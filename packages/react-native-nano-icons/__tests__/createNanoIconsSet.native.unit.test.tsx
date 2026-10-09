import { createElement, type ReactElement } from 'react';
import { UIManager } from 'react-native';

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

type HostNode = { type: unknown; props: Record<string, unknown> };
type TestRendererModule = {
  act(callback: () => void): void;
  create(element: ReactElement): {
    root: { findAll(predicate: (node: HostNode) => boolean): HostNode[] };
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
  },
} as const;

const Icon = createIconSet(glyphMap);

type IconElementProps = Parameters<typeof Icon>[0];

function nativeColors(props: IconElementProps): unknown {
  let tree!: ReturnType<TestRendererModule['create']>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(createElement(Icon, { size: 24, ...props }));
  });
  const nodes = tree.root.findAll((node) => node.type === 'NanoIconView');
  expect(nodes).toHaveLength(1);
  return nodes[0]!.props['colors'];
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
