'use client';

import { useEffect, useState } from 'react';
import {
  addFontIntegrityListener,
  createNanoIconSet,
  useFontIntegrityIssue,
  type GlyphEntry,
} from 'react-native-nano-icons';

import { glyphMap, Icon } from '../icons';

type Row = { case: string; expected: string; actual: string };

const entry = (name: keyof typeof glyphMap.i) => glyphMap.i[name] as GlyphEntry;

const withFamily = (f: string) => ({ ...glyphMap, m: { ...glyphMap.m, f } });

const MissingFontIcon = createNanoIconSet(
  withFamily('NextIconsMissing'),
  '/nanoicons/missing.woff2'
);

const LateFontIcon = createNanoIconSet(withFamily('NextIconsLate'));

const css = `
.size-64 { width: 64px; height: 64px; font-size: 64px; }
.text-40 { font-size: 40px; }
.red { color: red; }
`;

const iconOf = (name: string) =>
  document.querySelector<HTMLElement>(`[data-case="${name}"] .nano-icon`)!;

const layersOf = (name: string) =>
  Array.from(iconOf(name).querySelectorAll<HTMLElement>(':scope > span'));

const computedColor = (color: string) => {
  const probe = document.createElement('span');
  probe.style.color = color;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
};

const flagRatio = entry('ic_us_flag')[0] / glyphMap.m.u;

const squareOf = (name: string) => {
  const box = iconOf(name).getBoundingClientRect();
  const glyph = layersOf(name)[0]!.getBoundingClientRect();
  const centered =
    Math.abs(glyph.left + glyph.width / 2 - (box.left + box.width / 2)) < 0.5 &&
    Math.abs(glyph.top + glyph.height / 2 - (box.top + box.height / 2)) < 0.5;
  const inside =
    glyph.left >= box.left - 0.5 &&
    glyph.right <= box.right + 0.5 &&
    glyph.top >= box.top - 0.5 &&
    glyph.bottom <= box.bottom + 0.5;
  return {
    box: `${box.width}px × ${box.height}px`,
    glyph: `${centered ? 'centered' : 'off-center'}, ${inside ? 'inside' : 'outside'}`,
  };
};

const accessibilityOf = (name: string) => {
  const icon = iconOf(name);
  return ['role', 'aria-label', 'aria-hidden']
    .map((attribute) => `${attribute}=${icon.getAttribute(attribute) ?? '-'}`)
    .join(' ');
};

function measure(): Row[] {
  const style = (el: Element) => getComputedStyle(el);
  const fontFace = Array.from(document.fonts).find(
    (face) => face.family.replace(/"/g, '') === 'NextIcons'
  );
  return [
    {
      case: 'font registered from the font argument',
      expected: 'loaded',
      actual: fontFace?.status ?? '(none)',
    },
    {
      case: 'no size: height follows the parent font-size (20px)',
      expected: '20px',
      actual: style(iconOf('default-size')).height,
    },
    {
      case: 'class sets width, height and font-size (.size-64): width',
      expected: '64px',
      actual: style(iconOf('size-class')).width,
    },
    {
      case: 'class sets width, height and font-size (.size-64): glyph',
      expected: '64px',
      actual: style(layersOf('size-class')[0]!).fontSize,
    },
    {
      case: 'font-size class (.text-40) on a non-square icon: width',
      expected: `${(40 * flagRatio).toFixed(2)}px`,
      actual: `${parseFloat(style(iconOf('font-size-class')).width).toFixed(2)}px`,
    },
    {
      case: 'explicit size beats a font-size class',
      expected: '24px',
      actual: style(iconOf('explicit-size')).height,
    },
    {
      case: 'black icon follows the text colour (red)',
      expected: computedColor('red'),
      actual: style(layersOf('inherit-colour')[0]!).color,
    },
    {
      case: 'coloured single-colour icon keeps its colour under red text',
      expected: computedColor(entry('ic_react')[1][0]![1]),
      actual: style(layersOf('coloured')[0]!).color,
    },
    {
      case: 'multicolour icon keeps its colours under red text',
      expected: entry('ic_us_flag')[1]
        .map(([, c]) => computedColor(c))
        .join(' | '),
      actual: layersOf('multicolour')
        .map((l) => style(l).color)
        .join(' | '),
    },
    {
      case: 'explicit colour beats the text colour',
      expected: computedColor('#013369'),
      actual: style(layersOf('explicit-colour')[0]!).color,
    },
    {
      case: 'style array with a transform array',
      expected: 'rotate(90deg) / 4px',
      actual: `${iconOf('style-array').style.transform} / ${style(iconOf('style-array')).marginLeft}`,
    },
    {
      case: 'marginLeft beats marginHorizontal',
      expected: '2px / 8px',
      actual: `${style(iconOf('shorthand')).marginLeft} / ${style(iconOf('shorthand')).marginRight}`,
    },
    {
      case: 'square frame on a wide icon: box',
      expected: '40px × 40px',
      actual: squareOf('square-wide').box,
    },
    {
      case: 'square frame on a wide icon: glyph',
      expected: 'centered, inside',
      actual: squareOf('square-wide').glyph,
    },
    {
      case: 'square frame in a 40 × 40 style box: glyph',
      expected: 'centered, inside',
      actual: squareOf('square-styled').glyph,
    },
    {
      case: 'no accessibilityLabel: hidden from screen readers',
      expected: 'role=- aria-label=- aria-hidden=true',
      actual: accessibilityOf('decorative'),
    },
    {
      case: 'accessibilityLabel: an img with that label',
      expected: 'role=img aria-label=Star aria-hidden=-',
      actual: accessibilityOf('labelled'),
    },
    {
      case: 'accessibilityLabel changed after mount',
      expected: 'role=img aria-label=Second aria-hidden=-',
      actual: accessibilityOf('relabelled'),
    },
    {
      case: 'accessible set to false after mount',
      expected: 'role=- aria-label=- aria-hidden=true',
      actual: accessibilityOf('hidden-later'),
    },
  ];
}

export function Checks() {
  const [rows, setRows] = useState<Row[]>([]);
  const [label, setLabel] = useState('First');
  const [accessible, setAccessible] = useState(true);
  const fontIssue = useFontIntegrityIssue(glyphMap.m.f);
  const missingFontIssue = useFontIntegrityIssue('NextIconsMissing');
  const [lateFont, setLateFont] = useState('(pending)');

  useEffect(() => {
    let active = true;
    const statuses: string[] = [];
    const remove = addFontIntegrityListener((issue, status) => {
      if (issue.family === 'NextIconsLate') statuses.push(status);
    });
    void LateFontIcon.loadFont('/nanoicons/missing.woff2')
      .catch(() => LateFontIcon.loadFont('/nanoicons/NextIcons.woff2'))
      .then(() => active && setLateFont(statuses.join(' → ')));
    return () => {
      active = false;
      remove();
    };
  }, []);

  const integrityRows: Row[] = [
    {
      case: 'font that loads: no issue from useFontIntegrityIssue',
      expected: '(none)',
      actual: fontIssue ? 'found' : '(none)',
    },
    {
      case: 'font url that fails to load: issue from useFontIntegrityIssue',
      expected: 'found',
      actual: missingFontIssue ? 'found' : '(none)',
    },
    {
      case: 'loadFont fails, then loads: listener statuses',
      expected: 'found → resolved',
      actual: lateFont,
    },
  ];

  useEffect(() => {
    setLabel('Second');
    setAccessible(false);
  }, []);

  useEffect(() => {
    if (label !== 'Second') {
      return;
    }
    void document.fonts.ready.then(() => setRows(measure()));
  }, [label]);

  return (
    <>
      <style>{css}</style>
      <p style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span data-case="default-size" style={{ fontSize: 20 }}>
          <Icon name="ic_star" />
        </span>
        <span data-case="size-class">
          <Icon className="size-64" name="ic_star" />
        </span>
        <span data-case="font-size-class">
          <Icon className="text-40" name="ic_us_flag" />
        </span>
        <span data-case="explicit-size">
          <Icon className="text-40" name="ic_star" size={24} />
        </span>
        <span data-case="inherit-colour" className="red">
          <Icon name="ic_star" />
        </span>
        <span data-case="coloured" className="red">
          <Icon name="ic_react" />
        </span>
        <span data-case="multicolour" className="red">
          <Icon name="ic_us_flag" />
        </span>
        <span data-case="explicit-colour" className="red">
          <Icon name="ic_star" color="#013369" />
        </span>
        <span data-case="style-array">
          <Icon
            name="ic_square"
            style={[{ marginLeft: 4 }, { transform: [{ rotate: '90deg' }] }]}
          />
        </span>
        <span data-case="shorthand">
          <Icon
            name="ic_circle"
            style={{ marginHorizontal: 8, marginLeft: 2 }}
          />
        </span>
        <span data-case="square-wide">
          <Icon name="ic_us_flag" size={40} frame="square" />
        </span>
        <span data-case="square-styled">
          <Icon
            name="ic_us_flag"
            size={24}
            frame="square"
            style={{ width: 40, height: 40 }}
          />
        </span>
        <span data-case="decorative">
          <Icon name="ic_star" />
        </span>
        <span data-case="labelled">
          <Icon name="ic_star" accessibilityLabel="Star" />
        </span>
        <span data-case="relabelled">
          <Icon name="ic_circle" accessibilityLabel={label} />
        </span>
        <span data-case="hidden-later">
          <Icon
            name="ic_square"
            accessibilityLabel="Square"
            accessible={accessible}
          />
        </span>
        <span data-case="missing-font">
          <MissingFontIcon name="ic_star" />
        </span>
      </p>
      <table data-testid="checks">
        <thead>
          <tr>
            <th>Case</th>
            <th>Expected</th>
            <th>Actual</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(rows.length ? [...rows, ...integrityRows] : []).map((row) => (
            <tr key={row.case} data-pass={row.expected === row.actual}>
              <td>{row.case}</td>
              <td>{row.expected}</td>
              <td>{row.actual}</td>
              <td>{row.expected === row.actual ? '✅' : '❌'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
