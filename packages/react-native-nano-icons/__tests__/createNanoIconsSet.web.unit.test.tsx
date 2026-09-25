import { createElement, type CSSProperties, type ReactElement } from 'react';

import { createIconSet } from '../src/createNanoIconsSet.web';

type HostNode = {
  type: unknown;
  props: Record<string, unknown>;
};

type TestRendererModule = {
  act(callback: () => void): void;
  create(element: ReactElement): {
    root: { findAll(predicate: (node: HostNode) => boolean): HostNode[] };
  };
};

const TestRenderer = require('react-test-renderer') as TestRendererModule;

const glyphMap = {
  m: { f: 'Ui-0123abcd', u: 1024, z: 1020, s: 0xe900, h: '0123abcdef' },
  i: { heart: [1024, [[0xe900, 'black']]] },
} as const;

function layerStyles(): CSSProperties[] {
  const Icon = createIconSet(glyphMap);
  let tree!: ReturnType<TestRendererModule['create']>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      createElement(Icon, { name: 'heart', size: 24 })
    );
  });
  return tree.root
    .findAll(
      (node) => node.type === 'span' && node.props['aria-hidden'] === true
    )
    .map((node) => node.props['style'] as CSSProperties);
}

describe('createIconSet (web)', () => {
  test('layers use the configured family, not the build-hashed one', () => {
    const styles = layerStyles();
    expect(styles).toHaveLength(1);
    expect(styles[0]!.fontFamily).toBe('Ui');
  });

  test('display name uses the configured family', () => {
    expect(createIconSet(glyphMap).displayName).toBe('NanoIcon(Ui)');
  });

  test('loadFont is a no-op that resolves', async () => {
    await expect(createIconSet(glyphMap).loadFont()).resolves.toBeUndefined();
  });
});
