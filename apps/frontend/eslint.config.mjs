import { defineConfig } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import base from '../../eslint.config.base.mjs'

export default defineConfig(base, reactHooks.configs.flat.recommended, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: import.meta.dirname
    }
  }
})
