/** Verifies the schema our migrations produce (not the migration tool). */
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import * as assert from 'node:assert'
import type { DatabaseError } from 'pg'
import { type App, build, insertDocument } from '../helper'

/** One row of `information_schema.columns`. */
interface Column {
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

// Postgres SQLSTATE for a failed CHECK/foreign key/unique constraint.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'
const UNIQUE_VIOLATION = '23505'

/** Asserts `write` fails on a constraint with SQLSTATE `code`. */
function assertViolates(
  write: Promise<unknown>,
  code: string,
  message?: string
) {
  return assert.rejects(
    write,
    (err: unknown) => (err as DatabaseError).code === code,
    message
  )
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

test('documents table has the expected columns, types and defaults', async (t) => {
  const app = await build(t)
  const columns = await columnsOf(app, 'documents')

  assertColumnTypes(columns, {
    id: 'uuid',
    filename: 'text',
    mime_type: 'text',
    size_bytes: 'bigint',
    storage_path: 'text',
    content_sha256: 'text',
    created_at: 'timestamp with time zone',
    document_type: 'text',
    title: 'text',
    summary: 'text'
  })
  assert.match(columns.get('id')?.column_default ?? '', /gen_random_uuid/)
  assert.strictEqual(columns.get('filename')?.is_nullable, 'NO')
  assert.strictEqual(columns.get('storage_path')?.is_nullable, 'NO')
  assert.strictEqual(columns.get('content_sha256')?.is_nullable, 'NO')
  assert.match(columns.get('created_at')?.column_default ?? '', /now\(\)/)
})

test('documents.size_bytes rejects negative values', async (t) => {
  const app = await build(t)

  await assertViolates(insertDocument(app, { size_bytes: -1 }), CHECK_VIOLATION)
})

test('documents.content_sha256 rejects anything but a lowercase hex SHA-256', async (t) => {
  const app = await build(t)

  for (const hash of ['not-a-hash', 'AB'.repeat(32), 'ab'.repeat(31)]) {
    await assertViolates(
      insertDocument(app, { content_sha256: hash }),
      CHECK_VIOLATION,
      hash
    )
  }
})

test('documents.content_sha256 is unique', async (t) => {
  const app = await build(t)
  const hash = randomBytes(32).toString('hex')
  await insertDocument(app, { content_sha256: hash })

  await assertViolates(
    insertDocument(app, { content_sha256: hash }),
    UNIQUE_VIOLATION
  )
})

/** A complete, valid classification; tests override one field to break it. */
const CLASSIFICATION = {
  document_type: 'contract',
  title: 'Employment contract',
  summary: 'An employment contract.'
}

/** Sets a document's classification columns, as the worker's classify job does. */
function classify(
  app: App,
  documentId: string,
  values: Record<string, unknown>
) {
  return app.pg.query(
    `update documents
     set document_type = $2, title = $3, summary = $4
     where id = $1`,
    [documentId, values.document_type, values.title, values.summary]
  )
}

test('documents accepts a complete classification', async (t) => {
  const app = await build(t)
  const documentId = await insertDocument(app)

  await classify(app, documentId, CLASSIFICATION)
})

test('documents rejects a classification with only some fields set', async (t) => {
  const app = await build(t)
  const documentId = await insertDocument(app)

  await assertViolates(
    classify(app, documentId, { ...CLASSIFICATION, summary: null }),
    CHECK_VIOLATION
  )
})

test('documents.document_type rejects unknown types', async (t) => {
  const app = await build(t)
  const documentId = await insertDocument(app)

  await assertViolates(
    classify(app, documentId, { ...CLASSIFICATION, document_type: 'bogus' }),
    CHECK_VIOLATION
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
    error: 'text',
    created_at: 'timestamp with time zone'
  })
  assert.match(columns.get('id')?.column_default ?? '', /gen_random_uuid/)
  assert.strictEqual(columns.get('document_id')?.is_nullable, 'NO')
  assert.match(columns.get('status')?.column_default ?? '', /pending/)
})

test('jobs.status rejects values outside the known set', async (t) => {
  const app = await build(t)

  const documentId = await insertDocument(app)

  await assertViolates(
    app.pg.query(
      'insert into jobs (document_id, job_type, status) values ($1, $2, $3)',
      [documentId, 'extract', 'bogus']
    ),
    CHECK_VIOLATION
  )
})

test('jobs.error is rejected on a job that has not failed', async (t) => {
  const app = await build(t)

  const documentId = await insertDocument(app)

  await assertViolates(
    app.pg.query(
      'insert into jobs (document_id, job_type, error) values ($1, $2, $3)',
      [documentId, 'extract', 'some reason']
    ),
    CHECK_VIOLATION
  )
})

test('jobs.job_type accepts the worker types and rejects unknown ones', async (t) => {
  const app = await build(t)

  const documentId = await insertDocument(app)

  for (const jobType of ['extract', 'classify']) {
    await app.pg.query(
      'insert into jobs (document_id, job_type) values ($1, $2)',
      [documentId, jobType]
    )
  }
  await assertViolates(
    app.pg.query('insert into jobs (document_id, job_type) values ($1, $2)', [
      documentId,
      'bogus'
    ]),
    CHECK_VIOLATION
  )
})

test('jobs.document_id requires an existing document', async (t) => {
  const app = await build(t)
  const nonExistentDocumentId = '00000000-0000-0000-0000-000000000000'

  await assertViolates(
    app.pg.query('insert into jobs (document_id, job_type) values ($1, $2)', [
      nonExistentDocumentId,
      'extract'
    ]),
    FOREIGN_KEY_VIOLATION
  )
})

test('deleting a document cascades to its jobs and pages', async (t) => {
  const app = await build(t)

  const documentId = await insertDocument(app)

  const { rows: jobRows } = await app.pg.query<{ id: string }>(
    'insert into jobs (document_id, job_type) values ($1, $2) returning id',
    [documentId, 'extract']
  )
  const jobId = jobRows[0]?.id
  await app.pg.query(
    'insert into document_pages (document_id, page_number, text) values ($1, $2, $3)',
    [documentId, 1, 'page text']
  )

  await app.pg.query('delete from documents where id = $1', [documentId])

  const { rows: remainingJobs } = await app.pg.query(
    'select id from jobs where id = $1',
    [jobId]
  )
  assert.strictEqual(remainingJobs.length, 0)
  const { rows: remainingPages } = await app.pg.query(
    'select page_number from document_pages where document_id = $1',
    [documentId]
  )
  assert.strictEqual(remainingPages.length, 0)
})

/** The definition of index `name`, or `undefined` if it doesn't exist. */
async function indexDefinition(app: App, name: string) {
  const { rows } = await app.pg.query<{ indexdef: string }>(
    `select indexdef from pg_indexes
     where schemaname = current_schema() and indexname = $1`,
    [name]
  )
  return rows[0]?.indexdef
}

test('jobs has an index on (status, created_at) for claiming pending jobs', async (t) => {
  const app = await build(t)

  assert.match(
    (await indexDefinition(app, 'jobs_status_created_at_idx')) ?? '',
    /\(status, created_at\)/
  )
})

test("jobs has an index on document_id for reading a document's status", async (t) => {
  const app = await build(t)

  assert.match(
    (await indexDefinition(app, 'jobs_document_id_idx')) ?? '',
    /\(document_id\)/
  )
})

test('document_pages table has the expected columns and types', async (t) => {
  const app = await build(t)
  const columns = await columnsOf(app, 'document_pages')

  assertColumnTypes(columns, {
    document_id: 'uuid',
    page_number: 'integer',
    text: 'text'
  })
  for (const column of columns.values()) {
    assert.strictEqual(column.is_nullable, 'NO', column.column_name)
  }
})

test('document_pages.page_number starts at 1', async (t) => {
  const app = await build(t)

  const documentId = await insertDocument(app)

  await assertViolates(
    app.pg.query(
      'insert into document_pages (document_id, page_number, text) values ($1, $2, $3)',
      [documentId, 0, 'page text']
    ),
    CHECK_VIOLATION
  )
})
