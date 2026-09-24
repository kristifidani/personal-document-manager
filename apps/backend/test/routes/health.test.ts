/** Tests for `GET /health`. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { build } from '../helper'

test('GET /health returns ok', async (t) => {
  const app = await build(t)

  const res = await app.inject({ url: '/health' })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), { status: 'ok' })
})
