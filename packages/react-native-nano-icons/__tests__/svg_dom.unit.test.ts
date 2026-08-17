/** @jest-environment node */

import { DOMParser, type Element } from '@xmldom/xmldom';
import {
  calculateOpColor,
  parseFlattenedSvg,
  preprocessSvg,
  validateSvg,
  sanitizePathData,
  shouldSkipPath,
  extractOriginalEvenoddDs,
  restoreOriginalEvenoddDs,
  type ParsedFlatSvg,
} from '../src/core/svg/svg_dom';
import { parseColor } from '../src/utils/parse';

// ---------------------------------------------------------------------------
// parseColor
// ---------------------------------------------------------------------------

describe('parseColor', () => {
  test('rgba(r,g,b,a) — parses all four channels', () => {
    expect(parseColor('rgba(255,0,128,0.5)')).toEqual([255, 0, 128, 0.5]);
  });

  test('rgba(r,g,b,a) — tolerates spaces after commas', () => {
    expect(parseColor('rgba(255, 0, 128, 0.5)')).toEqual([255, 0, 128, 0.5]);
  });

  test('rgb(r,g,b) — alpha defaults to 1', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30, 1]);
  });

  test('#rrggbb — six-digit hex', () => {
    expect(parseColor('#ff0000')).toEqual([255, 0, 0, 1]);
  });

  test('#rrggbbaa — eight-digit hex, alpha channel', () => {
    expect(parseColor('#ff000080')).toEqual([255, 0, 0, 0.5019607843137255]);
  });

  test('#rgb — three-digit shorthand (each nibble × 17)', () => {
    expect(parseColor('#f00')).toEqual([255, 0, 0, 1]);
    expect(parseColor('#0f0')).toEqual([0, 255, 0, 1]);
    expect(parseColor('#abc')).toEqual([170, 187, 204, 1]);
  });

  test('named color — red', () => {
    expect(parseColor('red')).toEqual([255, 0, 0, 1]);
  });

  test('named color — case-insensitive', () => {
    expect(parseColor('Blue')).toEqual([0, 0, 255, 1]);
    expect(parseColor('BLUE')).toEqual([0, 0, 255, 1]);
  });

  test('named color — rebeccapurple', () => {
    expect(parseColor('rebeccapurple')).toEqual([102, 51, 153, 1]);
  });

  test('unknown color — fallback to opaque black', () => {
    expect(parseColor('currentColor')).toEqual([0, 0, 0, 1]);
    expect(parseColor('not-a-color')).toEqual([0, 0, 0, 1]);
  });
});

// ---------------------------------------------------------------------------
// calculateOpColor
// ---------------------------------------------------------------------------

describe('calculateOpColor', () => {
  function makeElement(svg: string, tagName: string): Element {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const el = doc.getElementsByTagName(tagName)[0];
    if (!el) throw new Error(`No <${tagName}> element found`);
    return el;
  }

  test('explicit fill + opacity multiplies alpha', () => {
    const el = makeElement(
      '<svg><path d="M0 0" fill="#ff0000" opacity="0.5"/></svg>',
      'path'
    );
    expect(calculateOpColor('#ff0000', 0.5, el)).toBe('rgba(255,0,0,0.5)');
  });

  test('null fill walks up to parent fill attr', () => {
    const el = makeElement(
      '<svg><g fill="blue"><path d="M0 0"/></g></svg>',
      'path'
    );
    expect(calculateOpColor(null, 0.5, el)).toBe('rgba(0,0,255,0.5)');
  });

  test('null fill with no ancestor fill falls back to black', () => {
    const el = makeElement('<svg><path d="M0 0"/></svg>', 'path');
    expect(calculateOpColor(null, 0.5, el)).toBe('rgba(0,0,0,0.5)');
  });

  test('skips ancestor fill="inherit" and keeps walking', () => {
    const el = makeElement(
      '<svg fill="green"><g fill="inherit"><path d="M0 0"/></g></svg>',
      'path'
    );
    expect(calculateOpColor(null, 1, el)).toBe('rgba(0,128,0,1)');
  });

  test('rgba fill + opacity — alpha values multiply', () => {
    const el = makeElement('<svg><path d="M0 0"/></svg>', 'path');
    expect(calculateOpColor('rgba(255,0,0,0.8)', 0.5, el)).toBe(
      'rgba(255,0,0,0.4)'
    );
  });

  test('opacity=1 is a no-op on opaque fill', () => {
    const el = makeElement('<svg><path d="M0 0"/></svg>', 'path');
    expect(calculateOpColor('#00ff00', 1, el)).toBe('rgba(0,255,0,1)');
  });

  test('alpha is rounded to 4 decimal places', () => {
    const el = makeElement('<svg><path d="M0 0"/></svg>', 'path');
    const result = calculateOpColor('#ffffff', 1 / 3, el);
    expect(result).toBe('rgba(255,255,255,0.3333)');
  });
});

// ---------------------------------------------------------------------------
// parseFlattenedSvg — opacity integration
// ---------------------------------------------------------------------------

describe('parseFlattenedSvg opacity integration', () => {
  test('path with opacity and no fill attr resolves fill from parent', () => {
    const svg = `<svg viewBox="0 0 24 24">
      <g fill="blue">
        <path d="M0 0L24 24" opacity="0.5"/>
      </g>
    </svg>`;
    const { paths } = parseFlattenedSvg(svg);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.fill).toBe('rgba(0,0,255,0.5)');
  });

  test('path with fill-opacity produces rgba fill', () => {
    const svg = `<svg viewBox="0 0 24 24">
      <path d="M0 0L24 24" fill="#ff0000" fill-opacity="0.25"/>
    </svg>`;
    const { paths } = parseFlattenedSvg(svg);
    expect(paths[0]!.fill).toBe('rgba(255,0,0,0.25)');
  });

  test('both opacity and fill-opacity are multiplied together', () => {
    const svg = `<svg viewBox="0 0 24 24">
      <path d="M0 0L24 24" fill="white" opacity="0.5" fill-opacity="0.5"/>
    </svg>`;
    const { paths } = parseFlattenedSvg(svg);
    expect(paths[0]!.fill).toBe('rgba(255,255,255,0.25)');
  });

  test('path without any opacity attr preserves original fill string', () => {
    const svg = `<svg viewBox="0 0 24 24">
      <path d="M0 0L24 24" fill="#123456"/>
    </svg>`;
    const { paths } = parseFlattenedSvg(svg);
    expect(paths[0]!.fill).toBe('#123456');
  });

  test('path without fill or opacity attr returns null fill', () => {
    const svg = `<svg viewBox="0 0 24 24">
      <path d="M0 0L24 24"/>
    </svg>`;
    const { paths } = parseFlattenedSvg(svg);
    expect(paths[0]!.fill).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateSvg
// ---------------------------------------------------------------------------

describe('validateSvg', () => {
  test('plain SVG without unsupported elements is valid', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    expect(validateSvg(svg)).toEqual({ valid: true });
  });

  test('SVG with <mask …> is invalid and reason mentions mask', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><mask id="m"><rect/></mask><path d="M0 0"/></svg>';
    const result = validateSvg(svg);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/mask/i);
    }
  });

  test('SVG with <filter> is invalid and reason mentions filter', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><filter id="f"/><path d="M0 0"/></svg>';
    const result = validateSvg(svg);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/filter/i);
    }
  });

  test('SVG with embedded <image> is invalid and reason mentions image', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAA"/></svg>';
    const result = validateSvg(svg);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/image/i);
    }
  });

  test('SVG with <clipPath> is valid', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="c"><path d="M0 0h24v24H0z"/></clipPath></defs><g clip-path="url(#c)"><path d="M1 1"/></g></svg>';
    expect(validateSvg(svg)).toEqual({ valid: true });
  });
});

// ---------------------------------------------------------------------------
// preprocessSvg
// ---------------------------------------------------------------------------

describe('preprocessSvg', () => {
  test('SVG without xmlns gets it injected', () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>';
    const result = preprocessSvg(svg);
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  test('SVG that already has xmlns is returned unchanged', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0"/></svg>';
    expect(preprocessSvg(svg)).toBe(svg);
  });

  test('string without <svg tag is returned unchanged', () => {
    const s = '<g><path d="M0 0"/></g>';
    expect(preprocessSvg(s)).toBe(s);
  });
});

// ---------------------------------------------------------------------------
// sanitizePathData
// ---------------------------------------------------------------------------

describe('sanitizePathData', () => {
  test('path already starting with M is left untouched', () => {
    const { d, sanitized } = sanitizePathData('M10 10 H20 Z');
    expect(sanitized).toBe(false);
    expect(d).toBe('M10 10 H20 Z');
  });

  test('lowercase m also counts as having an initial moveto', () => {
    expect(sanitizePathData('m5 5 l10 0').sanitized).toBe(false);
  });

  test('path missing moveto gets M prepended from its last coordinate pair', () => {
    // closed shape: endpoint equals the start, so this reconstructs it
    const { d, sanitized } = sanitizePathData('L30 40 L0 0 Z');
    expect(sanitized).toBe(true);
    expect(d).toBe('M0,0 L30 40 L0 0 Z');
  });

  test('empty / coordinate-less input is returned as a no-op', () => {
    expect(sanitizePathData('   ').sanitized).toBe(false);
    expect(sanitizePathData('Z').sanitized).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldSkipPath
// ---------------------------------------------------------------------------

describe('shouldSkipPath', () => {
  test('empty or whitespace d is skipped', () => {
    expect(shouldSkipPath('', '#000')).toBe(true);
    expect(shouldSkipPath('   ', '#000')).toBe(true);
  });

  test('fill "none" and "transparent" are skipped (case/space-insensitive)', () => {
    expect(shouldSkipPath('M0 0 H1', 'none')).toBe(true);
    expect(shouldSkipPath('M0 0 H1', ' TRANSPARENT ')).toBe(true);
  });

  test('a real path with a real fill is kept', () => {
    expect(shouldSkipPath('M0 0 H1 V1 Z', '#ff0000')).toBe(false);
    expect(shouldSkipPath('M0 0 H1 V1 Z', null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractOriginalEvenoddDs / restoreOriginalEvenoddDs
// ---------------------------------------------------------------------------

describe('extract/restore original evenodd d strings', () => {
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M0 0 H24 V24 H0 Z M6 6 H18 V18 H6 Z" fill-rule="evenodd" fill="black"/>
    <path d="M1 1 H2 V2 H1 Z" fill="red"/>
    <path d="M3 3 H4 V4 H3 Z" clip-rule="evenodd" fill="blue"/>
  </svg>`;

  test('extracts one d per evenodd path (fill-rule or clip-rule), in order', () => {
    const ds = extractOriginalEvenoddDs(SVG);
    expect(ds).toHaveLength(2);
    expect(ds[0]).toContain('M0 0 H24');
    expect(ds[1]).toBe('M3 3 H4 V4 H3 Z');
  });

  test('returns [] when the SVG has no evenodd rule at all', () => {
    const plain =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 H1 Z" fill="black"/></svg>';
    expect(extractOriginalEvenoddDs(plain)).toEqual([]);
  });

  test('restore overwrites evenodd paths positionally, leaving others alone', () => {
    const paths: ParsedFlatSvg['paths'] = [
      { d: 'DAMAGED-A', fill: 'black', fillRule: 'evenodd' },
      { d: 'keep-me', fill: 'red' },
      { d: 'DAMAGED-B', fill: 'blue', fillRule: 'evenodd' },
    ];
    restoreOriginalEvenoddDs(paths, ['ORIG-A', 'ORIG-B']);
    expect(paths[0]!.d).toBe('ORIG-A');
    expect(paths[1]!.d).toBe('keep-me');
    expect(paths[2]!.d).toBe('ORIG-B');
  });

  test('restore stops when originals run out (no out-of-range writes)', () => {
    const paths: ParsedFlatSvg['paths'] = [
      { d: 'A', fill: null, fillRule: 'evenodd' },
      { d: 'B', fill: null, fillRule: 'evenodd' },
    ];
    restoreOriginalEvenoddDs(paths, ['only-one']);
    expect(paths[0]!.d).toBe('only-one');
    expect(paths[1]!.d).toBe('B'); // no original left
  });
});
