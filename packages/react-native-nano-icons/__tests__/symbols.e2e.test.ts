/** @jest-environment node */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Must be set before any pipeline import so getPackageRoot() picks it up.
process.env.NANO_PACKAGE_ROOT = path.resolve(__dirname, '..');

import { buildAllSymbols, SymbolSetBuildError } from '../cli/buildSymbols';
import type { NanoLogger } from '../cli/logger';
import { copySymbolsetsIntoCatalog } from '../cli/link';
import { type NanoSymbolMap } from '../src/core/pipeline/runSymbolPipeline';
import { manifestBaseName } from '../src/utils/naming';
import { catalogRootContentsJson } from '../src/core/symbols/contents';

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

  it('annotates every layer with monochrome + multicolor classes and declares fills in a style block', async () => {
    const layered = await fsp.readFile(
      path.join(symbolsDir, `${PREFIX}.heart.symbolset`, `${PREFIX}.heart.svg`),
      'utf8'
    );
    expect(layered).toMatch(/<svg[^>]*>\s*<style>/);
    expect(layered).toContain('.monochrome-0 {fill:#000000}');
    expect(layered).toContain('.monochrome-1 {fill:#000000}');
    expect(layered).toContain(
      '.multicolor-0:custom {fill:#000000;opacity:0.3}'
    );
    expect(layered).toContain('.multicolor-1:custom {fill:#000000}');
    expect(layered).toContain('class="monochrome-0 multicolor-0:custom"');
    expect(layered).toContain('class="monochrome-1 multicolor-1:custom"');
    expect(layered).not.toContain('hierarchical-');

    const mono = await fsp.readFile(
      path.join(symbolsDir, `${PREFIX}.home.symbolset`, `${PREFIX}.home.svg`),
      'utf8'
    );
    expect(mono).toContain('class="monochrome-0 multicolor-0:custom"');
    expect(mono).not.toContain('monochrome-1');
  });

  it('keeps layer paths flat and fill-free inside each weight group', async () => {
    const svg = await fsp.readFile(
      path.join(symbolsDir, `${PREFIX}.heart.symbolset`, `${PREFIX}.heart.svg`),
      'utf8'
    );
    const symbols = svg.slice(svg.indexOf('<g id="Symbols">'));
    for (const weight of ['Ultralight', 'Regular', 'Black']) {
      const group = symbols.match(
        new RegExp(`<g id="${weight}-S"[^>]*>([\\s\\S]*?)</g>`)
      );
      expect(group).not.toBeNull();
      const body = group![1]!;
      expect(body).not.toContain('<g');
      expect(body).not.toContain('fill=');
      expect((body.match(/<path /g) ?? []).length).toBe(2);
    }
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
    expect(manifest).toContain(
      `interface NanoSymbolNames extends Record<${base}Name, true> {}`
    );
    expect(manifest).toContain(`declare module '@react-navigation/native'`);
    expect(manifest).toContain(
      `interface SFSymbolNames extends Record<${base}Symbol, true> {}`
    );
    expect(manifest).toContain('| "home"');
    expect(manifest).toContain('| "heart.fill"');
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

  it('centers the glyph: margin guides equal the scaled glyph bounds in every weight group', async () => {
    const wideRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-wide-'));
    try {
      const wideInput = path.join(wideRoot, 'icons');
      await fsp.mkdir(wideInput);
      await fsp.writeFile(
        path.join(wideInput, 'bar.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="#000"/></svg>'
      );
      const built = await buildAllSymbols(
        [{ inputDir: 'icons', name: 'wide', prefix: PREFIX }],
        wideRoot
      );
      const svg = await fsp.readFile(
        path.join(
          built[0]!.symbolsDir,
          `${PREFIX}.bar.symbolset`,
          `${PREFIX}.bar.svg`
        ),
        'utf8'
      );
      for (const [weight, left, right] of [
        ['Ultralight', 195, 335],
        ['Regular', 395, 535],
        ['Black', 595, 735],
      ] as const) {
        expect(svg).toContain(
          `<path id="left-margin-${weight}-S" d="M${left},56 l0,110" />`
        );
        expect(svg).toContain(
          `<path id="right-margin-${weight}-S" d="M${right},56 l0,110" />`
        );
        expect(svg).toContain(
          `<g id="${weight}-S" transform="matrix(1.4,0,0,1.4,${left},76)">`
        );
      }
    } finally {
      await fsp.rm(wideRoot, { recursive: true, force: true });
    }
  }, 120000);

  describe('knockouts', () => {
    const PLATE = '<rect x="0" y="0" width="60" height="100" fill="#001A72"/>';
    const RED_DOT = '<circle cx="70" cy="50" r="15" fill="#FF0000"/>';

    async function buildKnockout(body: string) {
      const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-ko-'));
      const input = path.join(root, 'icons');
      await fsp.mkdir(input);
      await fsp.writeFile(
        path.join(input, 'plate.svg'),
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`
      );
      const built = await buildAllSymbols(
        [{ inputDir: 'icons', name: 'ko', prefix: PREFIX }],
        root
      );
      const svg = await fsp.readFile(
        path.join(
          built[0]!.symbolsDir,
          `${PREFIX}.plate.symbolset`,
          `${PREFIX}.plate.svg`
        ),
        'utf8'
      );
      const contents = JSON.parse(
        await fsp.readFile(
          path.join(
            built[0]!.symbolsDir,
            `${PREFIX}.plate.symbolset`,
            'Contents.json'
          ),
          'utf8'
        )
      );
      const [monochrome = '', original = ''] = await Promise.all(
        built[0]!.drawableFiles.map((f) => fsp.readFile(f, 'utf8'))
      );
      const drawableNames = built[0]!.drawableFiles.map((f) =>
        path.basename(f)
      );
      await fsp.rm(root, { recursive: true, force: true });
      return { built, svg, contents, monochrome, original, drawableNames };
    }

    const fills = (xml: string) =>
      [...xml.matchAll(/android:fillColor="(#[0-9a-f]{6})"/g)].map((m) => m[1]);

    it('keeps white over ink as its own layer in one symbolset', async () => {
      const { built, svg, contents, monochrome, original, drawableNames } =
        await buildKnockout(
          PLATE +
            '<rect x="10" y="40" width="20" height="20" fill="#FFFFFF"/>' +
            RED_DOT
        );

      expect(built[0]!.assetDirs[0]).toMatch(/\.symbolset$/);
      expect(contents.properties['symbol-rendering-intent']).toBe('template');

      expect(svg).toContain('.multicolor-0:custom {fill:#001A72}');
      expect(svg).toContain('.multicolor-1:custom {fill:#FFFFFF}');
      expect(svg).toContain('.multicolor-2:custom {fill:#FF0000}');

      expect(drawableNames).toEqual([
        `${PREFIX}_plate.xml`,
        `${PREFIX}_plate_original.xml`,
      ]);
      expect(fills(original)).toEqual(['#001a72', '#ffffff', '#ff0000']);
      expect(fills(monochrome)).toEqual(['#000000']);
    }, 120000);

    it('data-nano-knockout picks the knockout and leaves white drawn', async () => {
      const { svg, monochrome, original } = await buildKnockout(
        PLATE +
          '<rect x="10" y="10" width="20" height="20" fill="#FFFFFF"/>' +
          '<rect data-nano-knockout="true" x="10" y="60" width="20" height="20" fill="#FF0000"/>'
      );

      expect(svg).toContain('.multicolor-1:custom {fill:#FFFFFF}');
      expect(svg).toContain('.multicolor-2:custom {fill:#FF0000}');
      expect(fills(original)).toEqual(['#001a72', '#ffffff', '#ff0000']);
      expect(fills(monochrome)).toEqual(['#000000']);
    }, 120000);
  });

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

  function collectingLogger(failed: string[]): NanoLogger {
    return {
      start: () => {},
      update: () => {},
      succeed: () => {},
      info: () => {},
      warn: () => {},
      fail: (msg) => failed.push(msg),
    };
  }

  it('fails the build naming both colliding files', async () => {
    const failed: string[] = [];
    await expect(
      buildAllSymbols([{ inputDir: 'icons', name: 'tabs' }], projectRoot, {
        logger: collectingLogger(failed),
      })
    ).rejects.toThrow(SymbolSetBuildError);
    expect(failed).toEqual([
      expect.stringMatching(
        /both map to the Android drawable name "nano_heart_fill"/
      ),
    ]);
  });

  it('keeps the previous outputs when asked to', async () => {
    const outputDir = path.join(projectRoot, 'nanoicons');
    const collision = path.join(projectRoot, 'icons', 'heart-fill.svg');
    await fsp.rename(collision, `${collision}.off`);
    await buildAllSymbols([{ inputDir: 'icons', name: 'tabs' }], projectRoot);
    await fsp.rename(`${collision}.off`, collision);
    const symbolmap = await fsp.readFile(
      path.join(outputDir, 'tabs.symbolmap.json'),
      'utf8'
    );

    await expect(
      buildAllSymbols([{ inputDir: 'icons', name: 'tabs' }], projectRoot, {
        keepOutputsOnFailure: true,
      })
    ).rejects.toThrow(SymbolSetBuildError);
    expect(
      await fsp.readFile(path.join(outputDir, 'tabs.symbolmap.json'), 'utf8')
    ).toBe(symbolmap);
    expect(
      fs.existsSync(
        path.join(outputDir, 'tabs.symbols', 'nano.heart.fill.symbolset')
      )
    ).toBe(true);

    await expect(
      buildAllSymbols([{ inputDir: 'icons', name: 'tabs' }], projectRoot)
    ).rejects.toThrow(SymbolSetBuildError);
    expect(fs.existsSync(path.join(outputDir, 'tabs.symbolmap.json'))).toBe(
      false
    );
    expect(fs.existsSync(path.join(outputDir, 'tabs.symbols'))).toBe(false);
  });
});
