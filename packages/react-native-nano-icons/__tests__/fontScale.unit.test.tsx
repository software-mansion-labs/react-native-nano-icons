import { createElement, type ReactElement } from 'react';
import { Dimensions } from 'react-native';

import { useFontScale } from '../src/utils/fontScale';

type TestRendererModule = {
  act(callback: () => void): void;
  create(element: ReactElement): { unmount(): void };
};

const TestRenderer = require('react-test-renderer') as TestRendererModule;

let seen: number | undefined;

function Probe({ enabled }: { enabled: boolean }) {
  seen = useFontScale(enabled);
  return null;
}

function render(enabled: boolean) {
  let tree!: ReturnType<TestRendererModule['create']>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(createElement(Probe, { enabled }));
  });
  return tree;
}

describe('useFontScale', () => {
  let addEventListener: jest.SpyInstance;

  beforeEach(() => {
    seen = undefined;
    addEventListener = jest.spyOn(Dimensions, 'addEventListener');
  });

  afterEach(() => {
    addEventListener.mockRestore();
  });

  test('does not listen to Dimensions changes when font scaling is disabled', () => {
    const tree = render(false);
    expect(seen).toBe(1);
    expect(addEventListener).not.toHaveBeenCalled();
    TestRenderer.act(() => tree.unmount());
  });

  test('listens to Dimensions changes when font scaling is enabled', () => {
    const tree = render(true);
    expect(addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    );
    TestRenderer.act(() => tree.unmount());
  });
});
