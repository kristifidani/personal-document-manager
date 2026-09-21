// Registered directly (not via the full app/autoload), matching how a single plugin is tested in isolation: see fastify-cli's own template convention.
import { test } from 'node:test'
import * as assert from 'node:assert'
import Fastify from 'fastify'
import env from '../../src/plugins/env'
import postgres from '../../src/plugins/postgres'

test('database connection accepts queries', async (t) => {
  const fastify = Fastify()
  await fastify.register(env)
  await fastify.register(postgres)
  await fastify.ready()

  t.after(() => fastify.close())

  const result = await fastify.pg.query<{ ok: number }>('SELECT 1 AS ok')

  assert.strictEqual(result.rows[0]?.ok, 1)
})
