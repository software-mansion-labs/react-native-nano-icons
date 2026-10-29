import { resolveWebStyle } from '../src/utils/webStyle';

test('empty styles resolve to nothing', () => {
  expect(resolveWebStyle(undefined)).toBeUndefined();
  expect(resolveWebStyle(null)).toBeUndefined();
  expect(resolveWebStyle(false)).toBeUndefined();
});

test('nested arrays flatten in order and skip falsy entries', () => {
  expect(
    resolveWebStyle([
      { opacity: 0.5 },
      [false, null, { opacity: 1 }],
      undefined,
    ])
  ).toEqual({ opacity: 1 });
});

test('transform arrays become a CSS transform', () => {
  expect(
    resolveWebStyle({
      transform: [
        { translateX: 4 },
        { translateY: '10%' },
        { rotate: '90deg' },
        { scale: 2 },
        { matrix: [1, 0, 0, 1, 0, 0] },
      ],
    })
  ).toEqual({
    transform:
      'translateX(4px) translateY(10%) rotate(90deg) scale(2) matrix(1,0,0,1,0,0)',
  });
});

test('a 16-value matrix becomes matrix3d', () => {
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1];
  expect(resolveWebStyle({ transform: [{ matrix }] })).toEqual({
    transform: `matrix3d(${matrix.join(',')})`,
  });
});

test('a border width without a border style draws a solid border, as in React Native', () => {
  expect(resolveWebStyle({ borderWidth: 1 })).toEqual({
    borderWidth: 1,
    borderStyle: 'solid',
  });
  expect(resolveWebStyle({ borderTopWidth: 2, borderLeftWidth: 0 })).toEqual({
    borderTopWidth: 2,
    borderTopStyle: 'solid',
    borderLeftWidth: 0,
    borderLeftStyle: 'solid',
  });
  expect(
    resolveWebStyle({ borderBottomWidth: 2, borderStyle: 'dashed' })
  ).toEqual({ borderBottomWidth: 2, borderStyle: 'dashed' });
  expect(resolveWebStyle({ borderWidth: undefined })).toEqual({
    borderWidth: undefined,
  });
});

test('string transforms pass through', () => {
  expect(resolveWebStyle({ transform: 'rotate(1turn)' })).toEqual({
    transform: 'rotate(1turn)',
  });
});

test('transformOrigin arrays become lengths', () => {
  expect(resolveWebStyle({ transformOrigin: [4, '50%', 0] })).toEqual({
    transformOrigin: '4px 50% 0px',
  });
});

test('axis shorthands expand to sides, and a side beats its axis and the base', () => {
  expect(
    resolveWebStyle({ margin: 1, marginHorizontal: 8, marginLeft: 2 })
  ).toEqual({ marginTop: 1, marginBottom: 1, marginLeft: 2, marginRight: 8 });
  expect(resolveWebStyle({ paddingVertical: 3 })).toEqual({
    paddingTop: 3,
    paddingBottom: 3,
  });
});

test('a side next to the base value keeps React Native precedence', () => {
  expect(resolveWebStyle({ marginLeft: 2, margin: 4 })).toEqual({
    marginTop: 4,
    marginBottom: 4,
    marginLeft: 2,
    marginRight: 4,
  });
});

test('a lone base value is left for CSS', () => {
  expect(resolveWebStyle({ margin: 4 })).toEqual({ margin: 4 });
});

test('start and end map to logical properties', () => {
  expect(
    resolveWebStyle({ marginStart: 1, paddingEnd: 2, start: 3, end: 4 })
  ).toEqual({
    marginInlineStart: 1,
    paddingInlineEnd: 2,
    insetInlineStart: 3,
    insetInlineEnd: 4,
  });
});

test('numeric lineHeight is in px, as in React Native', () => {
  expect(resolveWebStyle({ lineHeight: 20 })).toEqual({ lineHeight: '20px' });
});

test('the input is not mutated', () => {
  const style = { marginHorizontal: 4, transform: [{ rotate: '1deg' }] };
  resolveWebStyle(style);
  expect(style).toEqual({
    marginHorizontal: 4,
    transform: [{ rotate: '1deg' }],
  });
});
