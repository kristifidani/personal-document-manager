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
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true
      }
    },
    rules: {
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
