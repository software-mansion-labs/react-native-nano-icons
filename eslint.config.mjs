import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import satya164 from 'eslint-config-satya164';

export default [
  ...satya164,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-warning-comments': 'warn',
      'prefer-const': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': 'allow-with-description' },
      ],
    },
  },
  {
    ignores: [
      '**/lib/**',
      '**/node_modules/**',
      '**/*.config.*',
      'scripts/**',
    ],
  },
];
