// Verifies our own migration files produced the expected shape (not the
// migration tool itself). Assumes migrations already ran against the DB.

import { test } from 'node:test'
import * as assert from 'node:assert'
import type { DatabaseError } from 'pg'
// Type-only: pulls in fastify.pg's ambient type augmentation. helper.ts
// doesn't import it statically (postgres is loaded via @fastify/autoload),
// and node:test isolates each file, so each file needs this itself
// (see test/plugins/postgres.test.ts, which gets it via importing the plugin).
import '@fastify/postgres'
import { build } from '../helper'

type App = Awaited<ReturnType<typeof build>>

type Column = {
  column_name: string
  data_type: string
  is_nullable: 'YES' | 'NO'
  column_default: string | null
}

async function columnsOf(app: App, table: string) {
  const { rows } = await app.pg.query<Column>(
    `select column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema = current_schema() and table_name = $1`,
    [table]
  )
  return new Map(rows.map((row) => [row.column_name, row]))
}

// Postgres SQLSTATE for a failed CHECK/NOT NULL/foreign key constraint.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'

function codeOf(err: unknown) {
  return (err as DatabaseError).code
}

test('documents table has the expected columns, types and defaults', async (t) => {
  const app = await build(t)
  const columns = await columnsOf(app, 'documents')

  assert.deepStrictEqual([...columns.keys()].sort(), [
    'created_at',
    'filename',
    'id',
    'mime_type',
    'size_bytes'
  ])
  assert.strictEqual(columns.get('id')?.data_type, 'uuid')
  assert.match(columns.get('id')?.column_default ?? '', /gen_random_uuid/)
  assert.strictEqual(columns.get('filename')?.data_type, 'text')
  assert.strictEqual(columns.get('filename')?.is_nullable, 'NO')
  assert.strictEqual(columns.get('mime_type')?.data_type, 'text')
  assert.strictEqual(columns.get('size_bytes')?.data_type, 'bigint')
  assert.strictEqual(
    columns.get('created_at')?.data_type,
    'timestamp with time zone'
  )
  assert.match(columns.get('created_at')?.column_default ?? '', /now\(\)/)
})

test('documents.size_bytes rejects negative values', async (t) => {
  const app = await build(t)

  await assert.rejects(
    app.pg.query(
      'insert into documents (filename, mime_type, size_bytes) values ($1, $2, $3)',
      ['test.pdf', 'application/pdf', -1]
    ),
    (err: unknown) => codeOf(err) === CHECK_VIOLATION
  )
})

test('jobs table has the expected columns, types and defaults', async (t) => {
  const app = await build(t)
  const columns = await columnsOf(app, 'jobs')

  assert.deepStrictEqual([...columns.keys()].sort(), [
    'created_at',
    'document_id',
    'id',
    'job_type',
    'status'
  ])
  assert.strictEqual(columns.get('id')?.data_type, 'uuid')
  assert.match(columns.get('id')?.column_default ?? '', /gen_random_uuid/)
  assert.strictEqual(columns.get('document_id')?.data_type, 'uuid')
  assert.strictEqual(columns.get('document_id')?.is_nullable, 'NO')
  assert.strictEqual(columns.get('job_type')?.data_type, 'text')
  assert.strictEqual(columns.get('status')?.data_type, 'text')
  assert.match(columns.get('status')?.column_default ?? '', /pending/)
  assert.strictEqual(
    columns.get('created_at')?.data_type,
    'timestamp with time zone'
  )
})

test('jobs.status rejects values outside the known set', async (t) => {
  const app = await build(t)

  const { rows } = await app.pg.query<{ id: string }>(
    'insert into documents (filename, mime_type, size_bytes) values ($1, $2, $3) returning id',
    ['test.pdf', 'application/pdf', 100]
  )
  const documentId = rows[0]?.id

  await assert.rejects(
    app.pg.query(
      'insert into jobs (document_id, job_type, status) values ($1, $2, $3)',
      [documentId, 'extract', 'bogus']
    ),
    (err: unknown) => codeOf(err) === CHECK_VIOLATION
  )

  await app.pg.query('delete from documents where id = $1', [documentId])
})

test('jobs.document_id requires an existing document', async (t) => {
  const app = await build(t)
  const nonExistentDocumentId = '00000000-0000-0000-0000-000000000000'

  await assert.rejects(
    app.pg.query('insert into jobs (document_id, job_type) values ($1, $2)', [
      nonExistentDocumentId,
      'extract'
    ]),
    (err: unknown) => codeOf(err) === FOREIGN_KEY_VIOLATION
  )
})

test('deleting a document cascades to its jobs', async (t) => {
  const app = await build(t)

  const { rows: documentRows } = await app.pg.query<{ id: string }>(
    'insert into documents (filename, mime_type, size_bytes) values ($1, $2, $3) returning id',
    ['test.pdf', 'application/pdf', 100]
  )
  const documentId = documentRows[0]?.id

  const { rows: jobRows } = await app.pg.query<{ id: string }>(
    'insert into jobs (document_id, job_type) values ($1, $2) returning id',
    [documentId, 'extract']
  )
  const jobId = jobRows[0]?.id

  // The delete under test doubles as this test's own cleanup.
  await app.pg.query('delete from documents where id = $1', [documentId])

  const { rows: remainingJobs } = await app.pg.query(
    'select id from jobs where id = $1',
    [jobId]
  )
  assert.strictEqual(remainingJobs.length, 0)
})

test('jobs has an index on (status, created_at) for the worker claim query', async (t) => {
  const app = await build(t)

  const { rows } = await app.pg.query<{ indexdef: string }>(
    `select indexdef from pg_indexes
     where schemaname = current_schema() and tablename = 'jobs' and indexname = 'jobs_status_created_at_idx'`
  )

  assert.strictEqual(rows.length, 1)
  assert.match(rows[0]?.indexdef ?? '', /\(status, created_at\)/)
})
