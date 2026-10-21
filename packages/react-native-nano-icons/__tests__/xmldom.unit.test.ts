/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { loadPathKit } from './helpers/geometry';
import type { PathKitModule } from '../src/core/pathkit/types';

type Modules = {
  xmldomVersion: string;
  parse: typeof import('../src/core/glyph/parse');
  knockout: typeof import('../src/core/symbols/knockout');
  dom: typeof import('../src/core/flatten/dom');
  prepare: typeof import('../src/core/pipeline/prepare');
};

function load(xmldom: '@xmldom/xmldom' | '@xmldom/xmldom-0.8'): Modules {
  let modules!: Modules;
  jest.isolateModules(() => {
    jest.doMock('@xmldom/xmldom', () => jest.requireActual(xmldom));
    modules = {
      xmldomVersion: (
        jest.requireActual(`${xmldom}/package.json`) as { version: string }
      ).version,
      parse: require('../src/core/glyph/parse'),
      knockout: require('../src/core/symbols/knockout'),
      dom: require('../src/core/flatten/dom'),
      prepare: require('../src/core/pipeline/prepare'),
    };
  });
  return modules;
}

const v09 = load('@xmldom/xmldom');
const v08 = load('@xmldom/xmldom-0.8');

const TESTICONS_DIR = path.resolve(
  __dirname,
  '../../../examples/BareReactNativeExample/assets/testicons'
);
const ICONS = fs
  .readdirSync(TESTICONS_DIR)
  .filter((f) => f.endsWith('.svg'))
  .sort();

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;

let PathKit: PathKitModule;

beforeAll(async () => {
  PathKit = await loadPathKit();
});

test('the versions under test are 0.9 and 0.8', () => {
  expect(v09.xmldomVersion).toMatch(/^0\.9\./);
  expect(v08.xmldomVersion).toBe('0.8.12');
});

describe.each([
  ['0.9', v09],
  ['0.8', v08],
])('xmldom %s', (_, m) => {
  test('a missing fill or opacity is absent, not empty', () => {
    const { paths } = m.parse.parseFlattenedSvg(
      svg(
        '<path d="M0 0H1V1Z"/><path fill="#00f" opacity="0.5" d="M0 0H1V1Z"/>'
      )
    );
    expect(paths.map((p) => p.fill)).toEqual([null, 'rgba(0,0,255,0.5)']);
  });

  test('an implicit fill under opacity comes from the parent element', () => {
    const { paths } = m.parse.parseFlattenedSvg(
      svg('<g fill="red"><path opacity="0.5" d="M0 0H1V1Z"/></g>')
    );
    expect(paths[0]!.fill).toBe('rgba(255,0,0,0.5)');
  });

  test('a knockout replaces only paints that are set', () => {
    const marked = m.knockout.markKnockoutFills(
      svg(
        '<g data-nano-knockout="true"><rect width="1" height="1"/><path stroke="#000" d="M0 0H1"/></g>'
      )
    )!;
    expect(marked).toContain('<rect width="1" height="1"/>');
    expect(marked).toContain('<path stroke="#fe01fe" d="M0 0H1"/>');
    expect(marked).not.toContain('style=');
  });

  test('a malformed document is rejected', () => {
    expect(() => m.dom.parseSvgDocument('<svg><g></svg>')).toThrow();
    expect(() => m.dom.parseSvgDocument('<svg>&nope;</svg>')).toThrow();
  });
});

test.each(ICONS)(
  '%s prepares to the same layers on both versions',
  async (file) => {
    const opts = {
      filePath: path.join(TESTICONS_DIR, file),
      fileLabel: file,
      pathkit: PathKit,
      tagKnockouts: true,
    };
    const [on09, on08] = await Promise.all([
      v09.prepare.prepareSvgLayers(opts),
      v08.prepare.prepareSvgLayers(opts),
    ]);
    expect(on08).toEqual(on09);
  }
);
