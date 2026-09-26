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
