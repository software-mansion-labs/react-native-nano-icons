jest.mock('react-native', () => {
  throw new Error('react-native was imported by the web entry');
});

test('the web entry does not import react-native', () => {
  const entry =
    require('../src/index.web') as typeof import('../src/index.web');
  expect(typeof entry.createNanoIconSet).toBe('function');
  expect(entry.getFontIntegrityIssues()).toEqual([]);
});

test('the package exports send non-React Native bundlers to the web entry', () => {
  const pkg = require('../package.json') as {
    exports: { '.': Record<string, unknown> };
  };
  const root = pkg.exports['.'];
  const web = {
    types: './lib/typescript/src/index.d.ts',
    default: './lib/module/index.web.js',
  };
  expect(root['react-native']).toBe('./lib/module/index.js');
  expect(root['browser']).toEqual(web);
  expect(root['import']).toEqual(web);
  expect(Object.keys(root).indexOf('react-native')).toBeLessThan(
    Object.keys(root).indexOf('browser')
  );
});
