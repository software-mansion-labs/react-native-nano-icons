import { createElement, type CSSProperties, type ReactElement } from 'react';

const mockLoadFontFromDevServer = jest.fn<Promise<boolean>, [string]>();
const mockPreload = jest.fn<void, [string, unknown]>();
const mockRegisterWebFont = jest.fn<Promise<void>, [string, string]>();

jest.mock('../src/devServerFont.web', () => ({
  loadFontFromDevServer: (family: string) => mockLoadFontFromDevServer(family),
}));
jest.mock('react-dom', () => ({
  preload: (href: string, options: unknown) => mockPreload(href, options),
}));
jest.mock('../src/webFont', () => ({
  ...jest.requireActual('../src/webFont'),
  registerWebFont: (family: string, url: string) =>
    mockRegisterWebFont(family, url),
}));

import { createIconSet } from '../src/createNanoIconsSet.web';

type HostNode = {
  type: unknown;
  props: Record<string, unknown>;
};

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
    heart: [1024, [[0xe900, 'black']]],
    wide: [2048, [[0xe901, '#000000']]],
    react: [1024, [[0xe902, '#61dafb']]],
    flag: [
      1536,
      [
        [0xe903, '#0a3161'],
        [0xe904, '#FFF'],
      ],
    ],
    message: [1024, [[0xe905, 'currentColor']]],
  },
} as const;

type Props = Record<string, unknown> & { name: keyof (typeof glyphMap)['i'] };

function render(props: Props, font?: unknown) {
  const Icon =
    font === undefined
      ? createIconSet(glyphMap)
      : createIconSet(glyphMap, font);
  let tree!: ReturnType<TestRendererModule['create']>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(createElement(Icon, props));
  });
  const find = (predicate: (node: HostNode) => boolean) =>
    tree.root.findAll(predicate);
  const container = find(
    (node) => node.type === 'span' && node.props['className'] !== undefined
  )[0]!;
  return {
    container,
    containerStyle: container.props['style'] as Record<string, unknown>,
    layerStyles: find(
      (node) => node.type === 'span' && node.props['className'] === undefined
    ).map((node) => node.props['style'] as CSSProperties | undefined),
    styles: find((node) => node.type === 'style').map((node) => node.props),
  };
}

const g = globalThis as { document?: unknown };

describe('createIconSet (web)', () => {
  beforeEach(() => {
    mockLoadFontFromDevServer.mockReset().mockResolvedValue(false);
    mockPreload.mockReset();
    mockRegisterWebFont.mockReset().mockResolvedValue(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete g.document;
    jest.restoreAllMocks();
  });

  test('the container lists the build family first and the configured one as fallback', () => {
    expect(render({ name: 'heart' }).containerStyle['fontFamily']).toBe(
      '"Ui-0123abcd", "Ui"'
    );
  });

  test('base rules come from one hoisted stylesheet, named by a hash of the rules', () => {
    const { styles, container } = render({ name: 'heart' });
    expect(styles).toHaveLength(1);
    expect(styles[0]).toMatchObject({
      href: expect.stringMatching(/^react-native-nano-icons:[0-9a-z]+$/),
      precedence: 'react-native-nano-icons',
    });
    expect(styles[0]!['children']).toContain(':where(.nano-icon)');
    expect(container.props['className']).toBe('nano-icon');
  });

  test('the layer rule has class specificity, so element rules of the app do not override it', () => {
    const css = render({ name: 'heart' }).styles[0]!['children'];
    expect(css).toMatch(
      /(^|\})\.nano-icon>span\{[^}]*font-family:inherit;font-size:inherit;/
    );
  });

  test('className is added next to the base class', () => {
    expect(
      render({ name: 'heart', className: 'size-64' }).container.props[
        'className'
      ]
    ).toBe('nano-icon size-64');
  });

  test('without size the box follows the font-size; size sets it in px', () => {
    expect(
      render({ name: 'heart' }).containerStyle['fontSize']
    ).toBeUndefined();
    expect(render({ name: 'heart', size: 24 }).containerStyle['fontSize']).toBe(
      24
    );
  });

  test('the width ratio comes from the advance width', () => {
    expect(render({ name: 'wide' }).containerStyle['--nano-icon-ratio']).toBe(
      2
    );
    expect(render({ name: 'flag' }).containerStyle['--nano-icon-ratio']).toBe(
      1.5
    );
  });

  test('a black or currentColor icon follows the text colour', () => {
    expect(render({ name: 'heart' }).layerStyles).toEqual([undefined]);
    expect(render({ name: 'wide' }).layerStyles).toEqual([undefined]);
    expect(render({ name: 'message' }).layerStyles).toEqual([undefined]);
  });

  test('coloured and multicolour icons keep their colours', () => {
    expect(render({ name: 'react' }).layerStyles).toEqual([
      { color: '#61dafb' },
    ]);
    expect(render({ name: 'flag' }).layerStyles).toEqual([
      { color: '#0a3161' },
      { color: '#FFF' },
    ]);
  });

  test('an explicit colour is written on every layer', () => {
    expect(render({ name: 'heart', color: 'red' }).layerStyles).toEqual([
      { color: 'red' },
    ]);
    expect(
      render({ name: 'flag', color: ['red', 'blue'] }).layerStyles
    ).toEqual([{ color: 'red' }, { color: 'blue' }]);
  });

  test('React Native styles are resolved onto the container', () => {
    const { containerStyle } = render({
      name: 'heart',
      style: [{ marginHorizontal: 4 }, { transform: [{ rotate: '90deg' }] }],
    });
    expect(containerStyle).toMatchObject({
      marginLeft: 4,
      marginRight: 4,
      transform: 'rotate(90deg)',
    });
  });

  test('a font url gets a hoisted @font-face under the configured family and a preload', () => {
    const { styles } = render({ name: 'heart' }, '/fonts/Ui.woff2');
    expect(styles[1]).toMatchObject({
      href: expect.stringMatching(/^react-native-nano-icons:[0-9a-z]+$/),
      precedence: 'react-native-nano-icons',
      children:
        '@font-face{font-family:"Ui";src:url("/fonts/Ui.woff2");font-display:block}',
    });
    expect(mockPreload).toHaveBeenCalledWith('/fonts/Ui.woff2', {
      as: 'font',
      crossOrigin: 'anonymous',
    });
  });

  test('the @font-face href is a hash of the family and url, without spaces', () => {
    const spaced = render({ name: 'heart' }, '/fonts/My Icons.woff2');
    const other = render({ name: 'heart' }, '/fonts/Other.woff2');
    expect(spaced.styles[1]!['href']).toMatch(
      /^react-native-nano-icons:[0-9a-z]+$/
    );
    expect(spaced.styles[1]!['href']).not.toBe(other.styles[1]!['href']);
  });

  test('a data: font url is not preloaded', () => {
    const url = 'data:font/woff2;base64,AAAA';
    const { styles } = render({ name: 'heart' }, url);
    expect(styles[1]!['children']).toContain(`url("${url}")`);
    expect(mockPreload).not.toHaveBeenCalled();
  });

  test('an { uri } font works like a url', () => {
    const { styles } = render({ name: 'heart' }, { uri: 'https://cdn/Ui.ttf' });
    expect(styles[1]!['children']).toContain('url("https://cdn/Ui.ttf")');
  });

  test('an asset id is not loaded and warns in development', () => {
    const { styles } = render({ name: 'heart' }, 42);
    expect(styles).toHaveLength(1);
    expect(mockPreload).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Icon font "Ui" is not loaded on web')
    );
  });

  test('in a development browser the build is requested from the dev server', async () => {
    g.document = {};
    createIconSet(glyphMap);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockLoadFontFromDevServer).toHaveBeenCalledWith('Ui-0123abcd');
  });

  test('outside a browser the dev server is not asked', async () => {
    createIconSet(glyphMap);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockLoadFontFromDevServer).not.toHaveBeenCalled();
  });

  test('loadFont registers the font under the configured family', async () => {
    await createIconSet(glyphMap, '/fonts/Ui.woff2').loadFont();
    expect(mockRegisterWebFont).toHaveBeenCalledWith('Ui', '/fonts/Ui.woff2');
    await createIconSet(glyphMap).loadFont({ uri: '/other.ttf' });
    expect(mockRegisterWebFont).toHaveBeenLastCalledWith('Ui', '/other.ttf');
  });

  test('loadFont without a font resolves without loading', async () => {
    await expect(createIconSet(glyphMap).loadFont()).resolves.toBeUndefined();
    expect(mockRegisterWebFont).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('loadFont with an asset id warns in development and loads nothing', async () => {
    await expect(createIconSet(glyphMap).loadFont(42)).resolves.toBeUndefined();
    expect(mockRegisterWebFont).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Icon font "Ui" is not loaded on web')
    );
  });

  test('display name uses the configured family', () => {
    expect(createIconSet(glyphMap).displayName).toBe('NanoIcon(Ui)');
  });

  test('an icon without a label is hidden from screen readers', () => {
    const { container } = render({ name: 'heart' });
    expect(container.props).toMatchObject({ 'aria-hidden': true });
    expect(container.props['role']).toBeUndefined();
    expect(container.props['aria-label']).toBeUndefined();
  });

  test('a label makes the icon an img with that label', () => {
    const { container } = render({ name: 'heart', accessibilityLabel: 'Like' });
    expect(container.props).toMatchObject({
      role: 'img',
      'aria-label': 'Like',
    });
    expect(container.props['aria-hidden']).toBeUndefined();
  });

  test('accessible without a label makes the icon an img named after the icon', () => {
    const { container } = render({ name: 'heart', accessible: true });
    expect(container.props).toMatchObject({
      role: 'img',
      'aria-label': 'heart',
    });
    expect(container.props['aria-hidden']).toBeUndefined();
  });

  test('an explicit opt-in exposes an icon without a label', () => {
    expect(
      render({ name: 'heart', importantForAccessibility: 'yes' }).container
        .props
    ).toMatchObject({ role: 'img', 'aria-label': 'heart' });
    expect(
      render({ name: 'heart', accessibilityElementsHidden: false }).container
        .props
    ).toMatchObject({ role: 'img', 'aria-label': 'heart' });
    expect(
      render({ name: 'heart', accessibilityRole: 'button' }).container.props
    ).toMatchObject({ role: 'button', 'aria-label': 'heart' });
  });

  test('a changed accessibility prop re-renders the icon', () => {
    const Icon = createIconSet(glyphMap);
    let tree!: ReturnType<TestRendererModule['create']>;
    const container = () =>
      tree.root.findAll(
        (node) => node.type === 'span' && node.props['className'] !== undefined
      )[0]!.props;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        createElement(Icon, { name: 'heart', accessibilityLabel: 'First' })
      );
    });
    TestRenderer.act(() =>
      tree.update(
        createElement(Icon, { name: 'heart', accessibilityLabel: 'Second' })
      )
    );
    expect(container()['aria-label']).toBe('Second');
    TestRenderer.act(() =>
      tree.update(
        createElement(Icon, {
          name: 'heart',
          accessibilityLabel: 'Second',
          accessible: false,
        })
      )
    );
    expect(container()['aria-hidden']).toBe(true);
  });

  test('a new style array with the same values does not re-render', () => {
    const Icon = createIconSet(glyphMap);
    let tree!: ReturnType<TestRendererModule['create']>;
    const container = () =>
      tree.root.findAll(
        (node) => node.type === 'span' && node.props['className'] !== undefined
      )[0]!.props;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        createElement(Icon, { name: 'heart', style: [{ margin: 4 }] })
      );
    });
    const before = container();
    TestRenderer.act(() =>
      tree.update(
        createElement(Icon, { name: 'heart', style: [{ margin: 4 }] })
      )
    );
    expect(container()).toBe(before);
    TestRenderer.act(() =>
      tree.update(
        createElement(Icon, { name: 'heart', style: [{ margin: 5 }] })
      )
    );
    expect(container()).not.toBe(before);
  });
});
