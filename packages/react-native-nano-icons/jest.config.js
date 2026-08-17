/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testTimeout: 180000,
  // only *.test.* are suites, exclude __tests__/helpers/
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
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
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@exodus/bytes|@csstools|parse5|pyodide|svg-pathdata|yerror)/)',
  ],
};
