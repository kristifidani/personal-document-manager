/** Verifies the schema our migrations produce (not the migration tool). Assumes `npm run migrate:up` already ran against `DATABASE_URL`. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import type { DatabaseError } from 'pg'
// Type-only: helper.ts loads plugins via autoload, so TypeScript doesn't see their `fastify.*` augmentations; each test file imports the ones it uses.
import '@fastify/postgres'
import { type App, build } from '../helper'

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

/** Asserts the table has exactly these columns, each with the given `data_type`. */
function assertColumnTypes(
  columns: Map<string, Column>,
  expected: Record<string, string>
) {
  assert.deepStrictEqual(
    [...columns.keys()].sort(),
    Object.keys(expected).sort()
  )
  for (const [name, dataType] of Object.entries(expected)) {
    assert.strictEqual(columns.get(name)?.data_type, dataType, name)
  }
}

/** Inserts a document row directly, bypassing the API, and returns its id. */
async function insertDocument(app: App, sizeBytes = 100) {
  const { rows } = await app.pg.query<{ id: string }>(
    'insert into documents (filename, mime_type, size_bytes, storage_path) values ($1, $2, $3, $4) returning id',
    ['test.pdf', 'application/pdf', sizeBytes, 'test-path']
  )
  return rows[0]?.id
}

test('documents table has the expected columns, types and defaults', async (t) => {
  const app = await build(t)
  const columns = await columnsOf(app, 'documents')

  assertColumnTypes(columns, {
    id: 'uuid',
    filename: 'text',
    mime_type: 'text',
    size_bytes: 'bigint',
    storage_path: 'text',
    created_at: 'timestamp with time zone'
  })
  assert.match(columns.get('id')?.column_default ?? '', /gen_random_uuid/)
  assert.strictEqual(columns.get('filename')?.is_nullable, 'NO')
  assert.strictEqual(columns.get('storage_path')?.is_nullable, 'NO')
  assert.match(columns.get('created_at')?.column_default ?? '', /now\(\)/)
})

test('documents.size_bytes rejects negative values', async (t) => {
  const app = await build(t)

  await assert.rejects(
    insertDocument(app, -1),
    (err: unknown) => codeOf(err) === CHECK_VIOLATION
  )
})

test('jobs table has the expected columns, types and defaults', async (t) => {
  const app = await build(t)
  const columns = await columnsOf(app, 'jobs')

  assertColumnTypes(columns, {
    id: 'uuid',
    document_id: 'uuid',
    job_type: 'text',
    status: 'text',
    created_at: 'timestamp with time zone'
  })
  assert.match(columns.get('id')?.column_default ?? '', /gen_random_uuid/)
  assert.strictEqual(columns.get('document_id')?.is_nullable, 'NO')
  assert.match(columns.get('status')?.column_default ?? '', /pending/)
})

test('jobs.status rejects values outside the known set', async (t) => {
  const app = await build(t)

  const documentId = await insertDocument(app)

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

  const documentId = await insertDocument(app)

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

test('jobs has an index on (status, created_at) for claiming pending jobs', async (t) => {
  const app = await build(t)

  const { rows } = await app.pg.query<{ indexdef: string }>(
    `select indexdef from pg_indexes
     where schemaname = current_schema() and tablename = 'jobs' and indexname = 'jobs_status_created_at_idx'`
  )

  assert.strictEqual(rows.length, 1)
  assert.match(rows[0]?.indexdef ?? '', /\(status, created_at\)/)
})
