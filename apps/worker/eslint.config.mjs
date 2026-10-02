import { defineConfig } from 'eslint/config'
import base from '../../eslint.config.base.mjs'

export default defineConfig(base, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: import.meta.dirname
    }
  }
})
