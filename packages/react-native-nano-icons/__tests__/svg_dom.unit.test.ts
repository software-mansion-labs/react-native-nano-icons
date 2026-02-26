/** @jest-environment node */

import { JSDOM } from 'jsdom';
import { calculateOpColor, parseFlattenedSvg } from '../src/core/svg/svg_dom';
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
  function makeElement(svg: string, selector: string): Element {
    const doc = new JSDOM(svg).window.document;
    const el = doc.querySelector(selector);
    if (!el) throw new Error(`No element matching "${selector}"`);
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
