/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { PathKitModule } from '../src/core/pathkit/types';
import { preparedSvgCacheKey } from '../src/core/pipeline/preparedSvgCache';
import {
  prepareSymbol,
  type SymbolAsset,
} from '../src/core/pipeline/prepareSymbol';
import { fingerprintSymbolDirSync } from '../src/utils/fingerPrint';
import { loadPathKit } from './helpers/geometry';

// Drawn on one 24-unit grid, like most icon sets: a short three-line menu, a tall square,
// and a bell-like shape with a red dot.
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;

const ICONS = {
  menu: '<path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z" fill="currentColor"/>',
  square: '<path d="M2 2h20v20H2z" fill="currentColor"/>',
  dot:
    '<path d="M4 4h12v16H4z" fill="currentColor"/>' +
    '<circle cx="19" cy="5" r="3" fill="#EF4444"/>',
} as const;

type IconName = keyof typeof ICONS;

let PathKit: PathKitModule;
let tempDir: string;

async function build(
  name: IconName,
  fit?: 'content' | 'viewBox'
): Promise<SymbolAsset> {
  const result = await prepareSymbol(
    {
      kind: 'symbol',
      file: `${name}.svg`,
      filePath: path.join(tempDir, `${name}.svg`),
      setName: 'fit',
      prefix: 'nano',
      fit,
    },
    PathKit
  );
  if (!result.asset) throw new Error(result.error ?? `${name}: no asset`);
  return result.asset;
}

/** The scale of the template's variant groups: `matrix(s,0,0,s,…)`. */
function templateScale(asset: SymbolAsset): number {
  return Number(/matrix\(([\d.]+),/.exec(asset.svg)![1]);
}

function viewport(xml: string): number[] {
  return /viewportWidth="([\d.]+)"[\s\S]*?viewportHeight="([\d.]+)"/
    .exec(xml)!
    .slice(1)
    .map(Number);
}

function renderingIntent(asset: SymbolAsset): string {
  return JSON.parse(asset.contents).properties['symbol-rendering-intent'];
}

beforeAll(async () => {
  PathKit = await loadPathKit();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-fit-'));
  for (const [name, body] of Object.entries(ICONS)) {
    fs.writeFileSync(path.join(tempDir, `${name}.svg`), svg(body));
  }
}, 60_000);

afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

describe('symbol fit', () => {
  test("'content' (the default) scales each icon's drawn shapes to the full height", async () => {
    const menu = await build('menu');
    const square = await build('square');
    // The menu's lines span 12 of its 24 units, the square 20: each fills the 70-unit cap band.
    expect(templateScale(menu)).toBeCloseTo(70 / 12, 2);
    expect(templateScale(square)).toBeCloseTo(70 / 20, 2);
  });

  test("'viewBox' gives every icon drawn on one grid the same scale", async () => {
    const menu = await build('menu', 'viewBox');
    const square = await build('square', 'viewBox');
    expect(templateScale(menu)).toBeCloseTo(templateScale(square), 3);
    expect(templateScale(menu)).toBeCloseTo(70 / 24, 2);
  });

  test("'viewBox' keeps the viewBox as both drawables' viewport", async () => {
    const menu = await build('menu', 'viewBox');
    expect(viewport(menu.vdXml)).toEqual([24, 24]);
    expect(viewport(menu.vdOriginalXml)).toEqual([24, 24]);
  });

  test('is part of the prepared-SVG cache key and the set fingerprint', () => {
    const task = {
      kind: 'symbol' as const,
      file: 'menu.svg',
      filePath: path.join(tempDir, 'menu.svg'),
      setName: 'fit',
      prefix: 'nano',
    };
    expect(preparedSvgCacheKey({ ...task, fit: 'viewBox' }, 'h')).not.toBe(
      preparedSvgCacheKey(task, 'h')
    );
    expect(preparedSvgCacheKey({ ...task, fit: 'content' }, 'h')).toBe(
      preparedSvgCacheKey(task, 'h')
    );

    const inputs = { prefix: 'nano', version: '1.0.0', toolchain: [] };
    expect(
      fingerprintSymbolDirSync(tempDir, { ...inputs, fit: 'viewBox' }).hash
    ).not.toBe(fingerprintSymbolDirSync(tempDir, inputs).hash);
  });
});

describe('currentColor in the multicolor rendering', () => {
  test('a currentColor layer follows the tint, a coloured layer keeps its fill', async () => {
    const asset = await build('dot');
    expect(asset.svg).toContain('class="monochrome-0 multicolor-0:tintColor"');
    expect(asset.svg).toContain('class="monochrome-1 multicolor-1:custom"');
    expect(asset.svg).toContain('.multicolor-1:custom {fill:#EF4444}');
  });

  test('a symbol drawn in more than one colour asks for multicolor, one colour stays template', async () => {
    expect(renderingIntent(await build('dot'))).toBe('multicolor');
    expect(renderingIntent(await build('menu'))).toBe('template');
  });
});
