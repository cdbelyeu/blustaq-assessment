import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Acceptance tests are black-box: they may only reach the service over HTTP.
    files: ['acceptance/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src/**'],
              message: 'Acceptance tests must not import application code; use HTTP.',
            },
          ],
        },
      ],
    },
  },
  { files: ['**/*.mjs'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
