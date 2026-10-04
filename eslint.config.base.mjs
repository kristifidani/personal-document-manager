import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

/**
 * Lint rules shared by every app. Each app's `eslint.config.mjs` extends this and adds its own `tsconfigRootDir`, plus any rules only that app needs.
 */
export default defineConfig(
  { ignores: ['dist/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true
      }
    },
    rules: {
      // Arrow shorthand is the idiom for callbacks whose result nobody reads: () => controller.abort().
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true }
      ],
      // Numbers format predictably in a template; the preset allows strings only.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true }
      ],
      // node:test's test() returns a promise that the test runner manages itself.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            {
              from: 'package',
              package: 'node:test',
              name: ['test', 'describe', 'it']
            }
          ]
        }
      ]
    }
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked]
  },
  prettier
)
