/** @jest-environment node */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Must be set before any pipeline import so getPackageRoot() picks it up.
process.env.NANO_PACKAGE_ROOT = path.resolve(__dirname, '..');

import { buildAllSymbols } from '../cli/buildSymbols';
import { copySymbolsetsIntoCatalog } from '../cli/link';
import { type NanoSymbolMap } from '../src/core/pipeline/runSymbolPipeline';
import { manifestBaseName } from '../src/utils/naming';
import { catalogRootContentsJson } from '../src/core/symbols/contents';
import { buildColoredSymbolSvg } from '../src/core/symbols/coloredSymbol';

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const STROKE_ICON = path.join(
  PACKAGE_ROOT,
  'test_icons',
  'swm_icons',
  'outline',
  'Home1.svg'
);
const TWOTONE_ICON = path.join(
  PACKAGE_ROOT,
  'test_icons',
  'material_icons',
  'twotone',
  'favorite.svg'
);

const PREFIX = 'nanotest';
const SET_NAME = 'tabicons';

function hasActool(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    execFileSync('xcrun', ['--find', 'actool'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

describe('Symbols E2E — .symbolset generation', () => {
  let projectRoot: string;
  let inputDir: string;
  let outputDir: string;
  let symbolsDir: string;

  beforeAll(async () => {
    projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-symbols-'));
    inputDir = path.join(projectRoot, 'icons');
    await fsp.mkdir(inputDir);

    // stroke icon (exercises picosvg stroke→fill), a 2-layer twotone icon,
    // and a `.fill` variant pair following the naming convention.
    await fsp.copyFile(STROKE_ICON, path.join(inputDir, 'home.svg'));
    await fsp.copyFile(TWOTONE_ICON, path.join(inputDir, 'heart.svg'));
    await fsp.copyFile(TWOTONE_ICON, path.join(inputDir, 'heart.fill.svg'));

    const built = await buildAllSymbols(
      [{ inputDir: 'icons', name: SET_NAME, prefix: PREFIX }],
      projectRoot
    );
    expect(built).toHaveLength(1);

    outputDir = path.join(projectRoot, 'nanoicons');
    symbolsDir = built[0]!.symbolsDir;
  }, 120000);

  afterAll(async () => {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  });

  it('emits one .symbolset per icon with Contents.json + template SVG', async () => {
    for (const symbol of ['home', 'heart', 'heart.fill']) {
      const dir = path.join(symbolsDir, `${PREFIX}.${symbol}.symbolset`);
      expect(fs.existsSync(path.join(dir, 'Contents.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, `${PREFIX}.${symbol}.svg`))).toBe(
        true
      );

      const contents = JSON.parse(
        await fsp.readFile(path.join(dir, 'Contents.json'), 'utf8')
      );
      expect(contents.symbols[0].filename).toBe(`${PREFIX}.${symbol}.svg`);
      expect(contents.symbols[0].idiom).toBe('universal');
    }
  });

  it('templates contain the three variable-template source groups and guides', async () => {
    const svg = await fsp.readFile(
      path.join(symbolsDir, `${PREFIX}.home.symbolset`, `${PREFIX}.home.svg`),
      'utf8'
    );
    for (const id of [
      'Notes',
      'Guides',
      'Symbols',
      'Ultralight-S',
      'Regular-S',
      'Black-S',
      'Capline-S',
      'Baseline-S',
      'left-margin-Regular-S',
      'right-margin-Regular-S',
      'template-version',
    ]) {
      expect(svg).toContain(`id="${id}"`);
    }
    expect(svg).toContain('Template v.3.0');
  });

  it('annotates multi-layer icons with monochrome + hierarchical classes', async () => {
    const layered = await fsp.readFile(
      path.join(symbolsDir, `${PREFIX}.heart.symbolset`, `${PREFIX}.heart.svg`),
      'utf8'
    );
    expect(layered).toContain('class="monochrome-0 hierarchical-0:secondary"');
    expect(layered).toContain('class="monochrome-1 hierarchical-1:primary"');

    // single-layer icons stay plain
    const mono = await fsp.readFile(
      path.join(symbolsDir, `${PREFIX}.home.symbolset`, `${PREFIX}.home.svg`),
      'utf8'
    );
    expect(mono).not.toContain('class="monochrome');
  });

  it('writes a types-only manifest and a fingerprinted symbolmap', async () => {
    const base = manifestBaseName(SET_NAME);
    const manifest = await fsp.readFile(
      path.join(outputDir, `${SET_NAME}.symbols.d.ts`),
      'utf8'
    );
    // types-only: augments NanoSymbolNames + exports name/symbol unions, no runtime map.
    expect(manifest).toContain(
      `declare module 'react-native-nano-icons/symbols'`
    );
    expect(manifest).toContain('interface NanoSymbolNames');
    expect(manifest).toContain('"home": true;');
    expect(manifest).toContain('"heart.fill": true;');
    expect(manifest).toContain(`export type ${base}Name =`);
    expect(manifest).toContain(`export type ${base}Symbol =`);
    expect(manifest).not.toContain('export const');
    expect(manifest).toContain(`"${PREFIX}.home"`);
    expect(manifest).toContain(`"${PREFIX}.heart.fill"`);

    const symbolmap = JSON.parse(
      await fsp.readFile(
        path.join(outputDir, `${SET_NAME}.symbolmap.json`),
        'utf8'
      )
    ) as NanoSymbolMap;
    expect(symbolmap.m.p).toBe(PREFIX);
    expect(typeof symbolmap.m.h).toBe('string');
    expect(symbolmap.s).toEqual({
      home: `${PREFIX}.home`,
      heart: `${PREFIX}.heart`,
      'heart.fill': `${PREFIX}.heart.fill`,
    });
  });

  it('skips regeneration when the SVG fingerprint is unchanged', async () => {
    const svgPath = path.join(
      symbolsDir,
      `${PREFIX}.home.symbolset`,
      `${PREFIX}.home.svg`
    );
    const mtimeBefore = fs.statSync(svgPath).mtimeMs;

    const built = await buildAllSymbols(
      [{ inputDir: 'icons', name: SET_NAME, prefix: PREFIX }],
      projectRoot
    );
    expect(built).toHaveLength(1);
    expect(built[0]!.symbols['home']).toBe(`${PREFIX}.home`);
    expect(fs.statSync(svgPath).mtimeMs).toBe(mtimeBefore);
  });

  it('copySymbolsetsIntoCatalog replaces stale prefixed symbolsets', async () => {
    const catalog = path.join(projectRoot, 'Images.xcassets');
    await fsp.mkdir(catalog);
    await fsp.writeFile(
      path.join(catalog, 'Contents.json'),
      catalogRootContentsJson()
    );
    // stale symbolset from a previous run (icon since removed)
    const stale = path.join(catalog, `${PREFIX}.removed.symbolset`);
    await fsp.mkdir(stale);
    // unrelated user-owned symbolset must survive
    const userOwned = path.join(catalog, 'custom.mine.symbolset');
    await fsp.mkdir(userOwned);

    const built = await buildAllSymbols(
      [{ inputDir: 'icons', name: SET_NAME, prefix: PREFIX }],
      projectRoot
    );
    copySymbolsetsIntoCatalog(catalog, built);

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(userOwned)).toBe(true);
    for (const symbol of ['home', 'heart', 'heart.fill']) {
      expect(
        fs.existsSync(path.join(catalog, `${PREFIX}.${symbol}.symbolset`))
      ).toBe(true);
    }
  });

  it('buildColoredSymbolSvg preserves original fills and viewBox', () => {
    const svg = buildColoredSymbolSvg({
      viewBox: [0, 0, 24, 24],
      layers: [
        { d: 'M0 0H24V24H0Z', fill: '#001A72' },
        { d: 'M4 4H20V20H4Z', fill: 'rgba(255,0,0,0.5)' },
        { d: 'M8 8H16V16H8Z', fill: null },
      ],
    });
    expect(svg).toContain('viewBox="0 0 24 24"');
    // hex → rgb(), opaque (no fill-opacity)
    expect(svg).toContain('fill="rgb(0,26,114)"');
    expect(svg).not.toContain('rgba(');
    // translucent → rgb() + fill-opacity
    expect(svg).toContain('fill="rgb(255,0,0)" fill-opacity="0.5"');
    // null fill → black default
    expect(svg).toContain('fill="rgb(0,0,0)"');
    expect((svg.match(/<path /g) ?? []).length).toBe(3);
  });

  it('emits colored .imageset assets (not symbolsets) when multicolor is set', async () => {
    const mcRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-mc-'));
    try {
      const mcInput = path.join(mcRoot, 'icons');
      await fsp.mkdir(mcInput);
      await fsp.copyFile(TWOTONE_ICON, path.join(mcInput, 'heart.svg'));

      const built = await buildAllSymbols(
        [{ inputDir: 'icons', name: 'mc', prefix: PREFIX, multicolor: true }],
        mcRoot
      );
      expect(built).toHaveLength(1);

      const imagesetDir = path.join(
        built[0]!.symbolsDir,
        `${PREFIX}.heart.imageset`
      );
      // imageset, not symbolset
      expect(fs.existsSync(imagesetDir)).toBe(true);
      expect(
        fs.existsSync(
          path.join(built[0]!.symbolsDir, `${PREFIX}.heart.symbolset`)
        )
      ).toBe(false);
      expect(built[0]!.assetDirs[0]).toBe(imagesetDir);

      // imageset Contents.json: original render intent + vector preserved
      const contents = JSON.parse(
        await fsp.readFile(path.join(imagesetDir, 'Contents.json'), 'utf8')
      );
      expect(contents.images[0].filename).toBe(`${PREFIX}.heart.svg`);
      expect(contents.properties['template-rendering-intent']).toBe('original');
      expect(contents.properties['preserves-vector-representation']).toBe(true);

      // the SVG keeps real colors (no symbol template scaffolding)
      const svg = await fsp.readFile(
        path.join(imagesetDir, `${PREFIX}.heart.svg`),
        'utf8'
      );
      expect(svg).toContain('fill="rgb(');
      expect(svg).not.toContain('id="Symbols"');
      expect(svg).not.toContain('multicolor-');
    } finally {
      await fsp.rm(mcRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('copySymbolsetsIntoCatalog handles .imageset assets', async () => {
    const mcRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-mc2-'));
    try {
      const mcInput = path.join(mcRoot, 'icons');
      await fsp.mkdir(mcInput);
      await fsp.copyFile(TWOTONE_ICON, path.join(mcInput, 'heart.svg'));

      const catalog = path.join(mcRoot, 'Images.xcassets');
      await fsp.mkdir(catalog);
      await fsp.writeFile(
        path.join(catalog, 'Contents.json'),
        catalogRootContentsJson()
      );
      // stale symbolset from a previous (monochrome) run of the same prefix
      await fsp.mkdir(path.join(catalog, `${PREFIX}.heart.symbolset`));

      const built = await buildAllSymbols(
        [{ inputDir: 'icons', name: 'mc', prefix: PREFIX, multicolor: true }],
        mcRoot
      );
      copySymbolsetsIntoCatalog(catalog, built);

      // mode switch cleaned the stale symbolset, copied the imageset
      expect(
        fs.existsSync(path.join(catalog, `${PREFIX}.heart.symbolset`))
      ).toBe(false);
      expect(
        fs.existsSync(path.join(catalog, `${PREFIX}.heart.imageset`))
      ).toBe(true);
    } finally {
      await fsp.rm(mcRoot, { recursive: true, force: true });
    }
  }, 120000);

  (hasActool() ? it : it.skip)(
    'actool compiles the generated catalog without errors',
    async () => {
      const catalog = path.join(projectRoot, 'Actool.xcassets');
      await fsp.mkdir(catalog, { recursive: true });
      await fsp.writeFile(
        path.join(catalog, 'Contents.json'),
        catalogRootContentsJson()
      );
      const built = await buildAllSymbols(
        [{ inputDir: 'icons', name: SET_NAME, prefix: PREFIX }],
        projectRoot
      );
      copySymbolsetsIntoCatalog(catalog, built);

      const compileDir = path.join(projectRoot, 'actool-out');
      await fsp.mkdir(compileDir);
      const output = execFileSync(
        'xcrun',
        [
          'actool',
          catalog,
          '--compile',
          compileDir,
          '--platform',
          'iphoneos',
          '--minimum-deployment-target',
          '15.0',
          '--target-device',
          'iphone',
          '--output-format',
          'human-readable-text',
          '--errors',
          '--warnings',
        ],
        { encoding: 'utf8' }
      );

      // actool exits 0 even on failure — assert on its diagnostics output.
      expect(output).not.toMatch(/error:/i);
      expect(fs.existsSync(path.join(compileDir, 'Assets.car'))).toBe(true);
    },
    120000
  );
});

describe('Symbols E2E — Android name collisions', () => {
  let projectRoot: string;

  beforeAll(async () => {
    projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-collide-'));
    const inputDir = path.join(projectRoot, 'icons');
    await fsp.mkdir(inputDir);
    // Distinct filenames that both sanitize to the same Android resource name
    // (dot vs dash → "nano_heart_fill").
    await fsp.copyFile(TWOTONE_ICON, path.join(inputDir, 'heart.fill.svg'));
    await fsp.copyFile(TWOTONE_ICON, path.join(inputDir, 'heart-fill.svg'));
  }, 120000);

  afterAll(async () => {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  });

  it('fails the build naming both colliding files', async () => {
    await expect(
      buildAllSymbols([{ inputDir: 'icons', name: 'tabs' }], projectRoot)
    ).rejects.toThrow(
      /both map to the Android drawable name "nano_heart_fill"/
    );
  });
});
