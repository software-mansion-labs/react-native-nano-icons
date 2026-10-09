/** @jest-environment node */

import { flattenSvg } from '../src/core/flatten/index';
import { loadPathKit } from './helpers/geometry';

const svg = (href: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24">` +
  `<defs><rect id="box" width="10" height="10"/></defs><use ${href} x="2" y="2"/></svg>`;

test('<use href> flattens identically to <use xlink:href>', async () => {
  const pathkit = await loadPathKit();
  expect(flattenSvg(svg('href="#box"'), pathkit)).toBe(
    flattenSvg(svg('xlink:href="#box"'), pathkit)
  );
});

test('the href is consumed by the expansion, not copied onto the result', async () => {
  const pathkit = await loadPathKit();
  expect(flattenSvg(svg('href="#box"'), pathkit)).not.toContain('href');
});
