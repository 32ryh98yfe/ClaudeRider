// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const BANNED_MATH = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'pow', 'hypot', 'cbrt', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'random'];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/generated/**', 'apps/client/public/**', 'test-results/**', 'playwright-report/**', 'docs/**', 'art/codex/refs/**', '.claude/**', 'tools/scratch/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.es2021 } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
      'prefer-const': 'warn',
    },
  },
  // Node-side code
  { files: ['apps/server/**', 'packages/trackc/**', 'tools/**', 'e2e/**', '*.config.*', '**/*.config.ts'], languageOptions: { globals: { ...globals.node } } },
  // Browser code
  { files: ['apps/client/**'], languageOptions: { globals: { ...globals.browser, ...globals.worker } } },
  // Package boundaries
  {
    files: ['packages/content/src/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['@cr/*', 'three', 'three/*', 'node:*', 'ws'] }] },
  },
  {
    files: ['packages/sim/src/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['@cr/net', '@cr/room', '@cr/trackc', 'three', 'three/*', 'three-mesh-bvh', 'node:*', 'ws', 'preact', 'preact/*'] }],
    },
  },
  {
    // Determinism: no transcendental math, no randomness, no wall clock in sim (AI excluded).
    files: ['packages/sim/src/**'],
    ignores: ['packages/sim/src/ai/**'],
    rules: {
      'no-restricted-properties': ['error', ...BANNED_MATH.map((p) => ({ object: 'Math', property: p, message: 'Banned in sim (determinism, ADR-003). Use sim/core/math.ts helpers.' }))],
      'no-restricted-globals': ['error', { name: 'Date', message: 'No wall clock in sim.' }, { name: 'performance', message: 'No wall clock in sim.' }, { name: 'Float32Array', message: 'No float32 state in sim (use Float64Array).' }],
      'no-restricted-syntax': ['error', { selector: "BinaryExpression[operator='**']", message: '** is banned in sim (ADR-003).' }, { selector: "AssignmentExpression[operator='**=']", message: '**= is banned in sim.' }],
    },
  },
  {
    files: ['packages/sim/src/ai/**'],
    rules: { 'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use seeded rng.' }], 'no-restricted-globals': ['error', 'Date', 'performance'] },
  },
  {
    files: ['packages/net/src/**', 'packages/room/src/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['@cr/trackc', 'three', 'three/*', 'node:*', 'ws', 'preact', 'preact/*'] }] },
  },
  {
    files: ['apps/server/src/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['@cr/trackc', '@cr/client', 'three', 'three/*', 'preact', 'preact/*'] }] },
  },
  {
    files: ['apps/client/src/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['@cr/trackc', '@cr/server', 'node:*', 'ws'] }] },
  },
);
