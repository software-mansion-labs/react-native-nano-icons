/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { mergeSameColorPaths } from '../src/core/glyph/merge';
import {
  approxSignedAreaFromContourCmds,
  orientedContours,
  verbMap,
} from '../src/core/pathkit/contours';
import type { PathKitModule } from '../src/core/pathkit/types';
import { canonicalWinding, reversedWinding } from '../src/core/pathkit/winding';
import {
  prepareSymbol,
  type SymbolAsset,
} from '../src/core/pipeline/prepareSymbol';
import {
  KNOCKOUT_MARKER_FILL,
  markKnockoutFills,
} from '../src/core/symbols/knockout';
import { loadPathKit } from './helpers/geometry';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

const PLATE = '<rect x="0" y="0" width="60" height="100" fill="#001A72"/>';

const FIXTURES = {
  twotone:
    '<path opacity=".3" d="M20 20H80V80H20Z"/>' +
    '<path d="M10 10H90V90H10ZM20 20V80H80V20Z"/>',
  whiteKnockout:
    PLATE +
    '<rect x="10" y="10" width="20" height="20" fill="#FFFFFF"/>' +
    '<path fill="#FFFFFF" fill-rule="evenodd" d="M10 50H50V90H10ZM20 60V80H40V60Z"/>',
  annotatedKnockout:
    PLATE +
    '<rect x="10" y="10" width="20" height="20" fill="#FFFFFF"/>' +
    '<circle data-nano-knockout="true" cx="30" cy="70" r="10" fill="#FF0000"/>',
  floatingKnockout:
    PLATE + '<rect x="40" y="40" width="50" height="20" fill="#FFFFFF"/>',
  annotatedStroke:
    PLATE +
    '<g data-nano-knockout="true" fill="none" stroke="#FFD700" stroke-width="4">' +
    '<path d="M10 50H50"/>' +
    '</g>',
  allWhite:
    '<rect x="0" y="0" width="40" height="40" fill="#FFFFFF"/>' +
    '<rect x="20" y="20" width="40" height="40" fill="#FFFFFF"/>',
} as const;

type FixtureName = keyof typeof FIXTURES;

let PathKit: PathKitModule;
let tempDir: string;
const assets = {} as Record<FixtureName, SymbolAsset>;

function area(d: string): number {
  const p = PathKit.FromSVGString(d);
  if (!p) return 0;
  p.simplify();
  const V = verbMap(PathKit);
  const total = orientedContours(p.toCmds(), V).reduce(
    (sum, c) => sum + approxSignedAreaFromContourCmds(c.cmds, V),
    0
  );
  p.delete?.();
  return Math.abs(total);
}

function difference(a: string, b: string): string {
  const pa = PathKit.FromSVGString(a)!;
  const pb = PathKit.FromSVGString(b)!;
  const out = PathKit.MakeFromOp(pa, pb, PathKit.PathOp!.DIFFERENCE!)!;
  out.simplify();
  const d = out.toSVGString();
  [pa, pb, out].forEach((p) => p.delete?.());
  return d;
}

function templateLayers(asset: SymbolAsset): string[] {
  const group = asset.svg.match(/<g id="Regular-S"[^>]*>([\s\S]*?)<\/g>/)![1]!;
  return [...group.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]!);
}

function monochromeJoin(asset: SymbolAsset): string {
  return templateLayers(asset).join(' ');
}

function drawablePaths(xml: string): string[] {
  return [...xml.matchAll(/android:pathData="([^"]*)"/g)].map((m) => m[1]!);
}

function joinMismatch(asset: SymbolAsset): number {
  const join = monochromeJoin(asset);
  const silhouette = drawablePaths(asset.vdXml)[0]!;
  return (
    area(difference(join, silhouette)) + area(difference(silhouette, join))
  );
}

beforeAll(async () => {
  PathKit = await loadPathKit();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-knockout-'));
  for (const [name, body] of Object.entries(FIXTURES)) {
    const filePath = path.join(tempDir, `${name}.svg`);
    fs.writeFileSync(filePath, svg(body));
    const result = await prepareSymbol(
      {
        kind: 'symbol',
        file: `${name}.svg`,
        filePath,
        setName: 'ko',
        prefix: 'nano',
      },
      PathKit
    );
    if (!result.asset) throw new Error(result.error ?? `${name}: no asset`);
    assets[name as FixtureName] = result.asset;
  }
}, 60_000);

afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

describe('forged symbol snapshots', () => {
  test.each(Object.keys(FIXTURES) as FixtureName[])(
    '%s: template and both drawables',
    (name) => {
      const asset = assets[name];
      expect({
        template: asset.svg,
        monochromeDrawable: asset.vdXml,
        originalDrawable: asset.vdOriginalXml,
      }).toMatchSnapshot();
    }
  );
});

describe('monochrome silhouette', () => {
  test.each(Object.keys(FIXTURES) as FixtureName[])(
    '%s: the joined template layers fill exactly the monochrome drawable',
    (name) => {
      expect(joinMismatch(assets[name])).toBeLessThan(0.05);
    }
  );

  test('a white knockout over ink is a hole', () => {
    const silhouette = drawablePaths(assets.whiteKnockout.vdXml)[0]!;
    expect(area(silhouette)).toBeCloseTo(6000 - 400 - (1600 - 400), 0);
  });

  test('an annotated knockout is a hole and unannotated white stays drawn', () => {
    const silhouette = drawablePaths(assets.annotatedKnockout.vdXml)[0]!;
    expect(area(silhouette)).toBeCloseTo(6000 - Math.PI * 100, 0);
  });

  test('a knockout is a hole over ink and drawn where it floats', () => {
    const silhouette = drawablePaths(assets.floatingKnockout.vdXml)[0]!;
    expect(area(silhouette)).toBeCloseTo(6000 - 400 + 600, 0);
  });

  test('an annotated stroked group knocks out its stroke', () => {
    const silhouette = drawablePaths(assets.annotatedStroke.vdXml)[0]!;
    expect(area(silhouette)).toBeCloseTo(6000 - 160, 0);
  });

  test('an all-white icon has no knockouts', () => {
    const silhouette = drawablePaths(assets.allWhite.vdXml)[0]!;
    expect(area(silhouette)).toBeCloseTo(1600 * 2 - 400, 0);
  });
});

describe('original rendering', () => {
  test('knockout layers keep their own fill', () => {
    expect(assets.whiteKnockout.svg).toContain(
      '.multicolor-1:custom {fill:#FFFFFF}'
    );
    expect(assets.annotatedKnockout.svg).toContain(
      '.multicolor-2:custom {fill:#FF0000}'
    );
    expect(assets.annotatedStroke.svg).toContain(
      '.multicolor-1:custom {fill:#FFD700}'
    );
  });

  test('translucent layers keep their opacity', () => {
    expect(assets.twotone.svg).toContain(
      '.multicolor-0:custom {fill:#000000;opacity:0.3}'
    );
    expect(assets.twotone.vdOriginalXml).toContain('android:fillAlpha="0.3"');
    expect(assets.twotone.vdXml).not.toContain('fillAlpha');
  });

  test('the original drawable has one path per template layer', () => {
    for (const asset of Object.values(assets)) {
      expect(drawablePaths(asset.vdOriginalXml)).toEqual(templateLayers(asset));
    }
  });
});

describe('markKnockoutFills', () => {
  test('returns null without annotations', () => {
    expect(markKnockoutFills(svg(PLATE))).toBeNull();
  });

  test('replaces explicit fills and strokes, keeps none', () => {
    const marked = markKnockoutFills(
      svg(
        '<g data-nano-knockout="true">' +
          '<rect fill="#fff" stroke="none" width="1" height="1"/>' +
          '<rect style="fill:red;opacity:.5" width="1" height="1"/>' +
          '<path fill="none" stroke="#123456" d="M0 0H1"/>' +
          '<circle r="1"/>' +
          '</g>'
      )
    )!;
    expect(marked).toContain(
      `<g data-nano-knockout="true" fill="${KNOCKOUT_MARKER_FILL}">`
    );
    expect(marked).toContain(
      `<rect fill="${KNOCKOUT_MARKER_FILL}" stroke="none"`
    );
    expect(marked).toContain(`style=";opacity:.5"`);
    expect(marked).toContain(`fill="none" stroke="${KNOCKOUT_MARKER_FILL}"`);
    expect(marked).toContain('<circle r="1"/>');
  });

  test('leaves unannotated siblings untouched', () => {
    const marked = markKnockoutFills(
      svg(
        '<rect fill="#fff" width="1" height="1"/>' +
          '<rect data-nano-knockout="true" fill="#fff" width="1" height="1"/>'
      )
    )!;
    expect(marked.match(new RegExp(KNOCKOUT_MARKER_FILL, 'g'))).toHaveLength(1);
  });
});

describe('winding helpers', () => {
  test('a reversed shape cancels its canonical copy under nonzero', () => {
    const ring = 'M0 0H10V10H0ZM2 2V8H8V2Z';
    const p = PathKit.FromSVGString(
      `${canonicalWinding(PathKit, ring)} ${reversedWinding(PathKit, ring)}`
    )!;
    p.simplify();
    expect(p.toSVGString().trim()).toBe('');
    p.delete?.();
  });

  test('canonical and reversed winding keep the hole of a ring', () => {
    const ring = 'M0 0H10V10H0ZM2 2V8H8V2Z';
    expect(area(canonicalWinding(PathKit, ring))).toBeCloseTo(64, 3);
    expect(area(reversedWinding(PathKit, ring))).toBeCloseTo(64, 3);
  });
});

describe('mergeSameColorPaths', () => {
  test('never merges a knockout with a same-color drawn path', () => {
    const merged = mergeSameColorPaths([
      { d: 'M0 0H1V1Z', fill: '#fff' },
      { d: 'M2 0H3V1Z', fill: '#fff', knockout: true },
      { d: 'M4 0H5V1Z', fill: '#fff', knockout: true },
    ]);
    expect(merged).toEqual([
      { d: 'M0 0H1V1Z', fill: '#fff' },
      { d: 'M2 0H3V1Z M4 0H5V1Z', fill: '#fff', knockout: true },
    ]);
  });
});
