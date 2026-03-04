/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testTimeout: 180000,
  moduleNameMapper: {
    '^file://(.+)$': '$1',
    '^(\\.{1,2}/.+)\\.js$': '$1',
  },
  modulePathIgnorePatterns: [
    '<rootDir>/example/node_modules',
    '<rootDir>/lib/',
  ],
  transform: {
    '^.+\\.(js|mjs|cjs|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@exodus/bytes|@csstools|parse5|pyodide|svgicons2svgfont|svg-pathdata|yerror)/|jsdom/node_modules/)',
  ],
};
