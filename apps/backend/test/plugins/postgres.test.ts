/** Tests for the postgres plugin, registered in isolation with only `env`. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import env from '../../src/plugins/env'
import postgres from '../../src/plugins/postgres'
import { buildPlugins } from '../helper'

test('database connection accepts queries', async (t) => {
  const fastify = await buildPlugins(t, env, postgres)

  const result = await fastify.pg.query<{ ok: number }>('SELECT 1 AS ok')

  assert.strictEqual(result.rows[0]?.ok, 1)
})

test('an idle client error is logged, not thrown', async (t) => {
  const fastify = await buildPlugins(t, env, postgres)

  // an `error` event with no listener throws, so this fails without the plugin's handler
  assert.doesNotThrow(() => fastify.pg.pool.emit('error', new Error('boom')))
})
