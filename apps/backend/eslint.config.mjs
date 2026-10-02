import { defineConfig } from 'eslint/config'
import base from '../../eslint.config.base.mjs'

export default defineConfig(base, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: import.meta.dirname
    }
  },
  rules: {
    // Fastify plugins and handlers are async by convention, even without await.
    '@typescript-eslint/require-await': 'off'
  }
})
