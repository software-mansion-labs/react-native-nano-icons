'use client';

import { useEffect, useState } from 'react';

import { glyphMap, Icon } from '../icons';

type Row = { case: string; expected: string; actual: string };

type Entry = [advance: number, layers: [codepoint: number, color: string][]];

const entry = (name: keyof typeof glyphMap.i) =>
  glyphMap.i[name] as unknown as Entry;

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
  ];
}

export function Checks() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    void document.fonts.ready.then(() => setRows(measure()));
  }, []);

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
          {rows.map((row) => (
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
