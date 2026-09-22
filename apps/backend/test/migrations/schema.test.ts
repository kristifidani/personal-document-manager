// Verifies our own migration files produced the expected shape (not the
// migration tool itself). Assumes migrations already ran against the DB.
import { test } from 'node:test'
import * as assert from 'node:assert'
// Type-only: pulls in fastify.pg's ambient type augmentation. helper.ts
// doesn't import it statically (postgres is loaded via @fastify/autoload),
// and node:test isolates each file, so each file needs this itself
// (see test/plugins/postgres.test.ts, which gets it via importing the plugin).
import '@fastify/postgres'
import { build } from '../helper'

async function columnsOf(
  app: Awaited<ReturnType<typeof build>>,
  table: string
) {
  const { rows } = await app.pg.query<{ column_name: string }>(
    'select column_name from information_schema.columns where table_name = $1',
    [table]
  )
  return new Set(rows.map((row) => row.column_name))
}

test('documents table has the expected columns', async (t) => {
  const app = await build(t)

  assert.deepStrictEqual(
    await columnsOf(app, 'documents'),
    new Set(['id', 'filename', 'mime_type', 'size_bytes', 'created_at'])
  )
})

test('jobs table has the expected columns', async (t) => {
  const app = await build(t)

  assert.deepStrictEqual(
    await columnsOf(app, 'jobs'),
    new Set(['id', 'document_id', 'job_type', 'status', 'created_at'])
  )
})
