/** Tests for `loadConfig`, with values passed as `data` so they override `.env` and `process.env`. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { loadConfig } from '../src/env'

test('returns the validated environment', () => {
  const config = loadConfig({
    DATABASE_URL: 'postgres://localhost/db',
    STORAGE_DIR: './storage',
    ANTHROPIC_API_KEY: 'test-key'
  })

  assert.strictEqual(config.DATABASE_URL, 'postgres://localhost/db')
  assert.strictEqual(config.STORAGE_DIR, './storage')
  assert.strictEqual(config.ANTHROPIC_API_KEY, 'test-key')
})

test('throws when a variable is empty', () => {
  assert.throws(() =>
    loadConfig({
      DATABASE_URL: '',
      STORAGE_DIR: './storage',
      ANTHROPIC_API_KEY: 'test-key'
    })
  )
})
