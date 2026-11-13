import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Syntax banned everywhere: HTML injection sinks (PRD §12 A05). */
export const bannedSyntax = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'Render text, never HTML (PRD §12 A05).',
  },
  {
    selector: 'AssignmentExpression > MemberExpression[property.name=/^(innerHTML|outerHTML)$/]',
    message: 'Assigning HTML strings is banned (PRD §12 A05).',
  },
];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/vendor/**',
      'packages/icons/figures/**',
      'apps/app/playwright-report/**',
      'apps/app/test-results/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'off',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-restricted-syntax': ['error', ...bannedSyntax],
    },
  },
  {
    files: ['packages/sim-engine/src/**/*.ts'],
    ignores: [
      'packages/sim-engine/src/**/*.test.ts',
      'packages/sim-engine/src/**/*.bench.ts',
      'packages/sim-engine/src/test-helpers.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-dom', 'react/*', '@xyflow/*', 'node:*'] },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'Date', 'localStorage'],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
