/** Tests for `POST /documents` against a real database and storage dir. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import * as assert from 'node:assert'
// Type-only: see the matching note in test/migrations/schema.test.ts.
import '@fastify/postgres'
import '../../src/plugins/env'
import '../../src/plugins/storage'
import { build } from '../helper'

const BOUNDARY = 'test-boundary'

function multipartPayload(filename: string, mimeType: string, content: Buffer) {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    content,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`)
  ])
}

function multipartHeaders() {
  return { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` }
}

function multipartTwoFilesPayload() {
  const part = (filename: string, content: string) =>
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n${content}\r\n`

  return Buffer.from(
    part('one.pdf', 'first') + part('two.pdf', 'second') + `--${BOUNDARY}--\r\n`
  )
}

type App = Awaited<ReturnType<typeof build>>

interface UploadResponse {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: string
}

interface DocumentRow {
  id: string
  storage_path: string
}

interface JobRow {
  job_type: string
  status: string
}

async function documentRow(app: App, id: string) {
  const { rows } = await app.pg.query<DocumentRow>(
    'select * from documents where id = $1',
    [id]
  )
  return rows[0]
}

async function jobRows(app: App, documentId: string) {
  const { rows } = await app.pg.query<JobRow>(
    'select * from jobs where document_id = $1',
    [documentId]
  )
  return rows
}

async function cleanup(app: App, id: string) {
  await app.pg.query('delete from documents where id = $1', [id])
  await app.storage.remove(id)
}

test('POST /documents stores the file and enqueues a job', async (t) => {
  const app = await build(t)
  const content = Buffer.from('%PDF-1.4 fake pdf content')

  const res = await app.inject({
    method: 'POST',
    url: '/documents',
    headers: multipartHeaders(),
    payload: multipartPayload('test.pdf', 'application/pdf', content)
  })

  assert.strictEqual(res.statusCode, 201)
  const body = res.json<UploadResponse>()

  assert.strictEqual(body.filename, 'test.pdf')
  assert.strictEqual(body.mime_type, 'application/pdf')
  assert.strictEqual(body.size_bytes, content.length)
  assert.ok(body.id)
  assert.ok(body.created_at)

  const document = await documentRow(app, body.id)
  assert.strictEqual(document?.storage_path, body.id)

  const jobs = await jobRows(app, body.id)
  assert.strictEqual(jobs.length, 1)
  assert.strictEqual(jobs[0].job_type, 'extract')
  assert.strictEqual(jobs[0].status, 'pending')

  const filePath = join(app.config.STORAGE_DIR, body.id)
  assert.ok(existsSync(filePath))

  await cleanup(app, body.id)
})

test('POST /documents without a file returns 400', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    method: 'POST',
    url: '/documents',
    headers: multipartHeaders(),
    payload: Buffer.from(`--${BOUNDARY}--\r\n`)
  })

  assert.strictEqual(res.statusCode, 400)
})

test('POST /documents with an unsupported mime type returns 415 and creates nothing', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    method: 'POST',
    url: '/documents',
    headers: multipartHeaders(),
    payload: multipartPayload('test.txt', 'text/plain', Buffer.from('hello'))
  })

  assert.strictEqual(res.statusCode, 415)

  const { rows } = await app.pg.query(
    "select id from documents where filename = 'test.txt'"
  )
  assert.strictEqual(rows.length, 0)
})

test('POST /documents with an oversized file returns 413 and cleans up', async (t) => {
  const app = await build(t)
  const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 'a')

  // Spy on save() to learn the generated id, which failure responses omit.
  // A directory snapshot would be flaky: test files run in parallel.
  let savedPath: string | undefined
  const originalSave = app.storage.save.bind(app.storage)
  app.storage.save = async (id, stream) => {
    const result = await originalSave(id, stream)
    savedPath = result.path
    return result
  }
  t.after(() => {
    app.storage.save = originalSave
  })

  const res = await app.inject({
    method: 'POST',
    url: '/documents',
    headers: multipartHeaders(),
    payload: multipartPayload('big.pdf', 'application/pdf', oversized)
  })

  assert.strictEqual(res.statusCode, 413)
  assert.ok(savedPath, 'expected storage.save to have been called')
  assert.strictEqual(existsSync(join(app.config.STORAGE_DIR, savedPath)), false)

  const { rows } = await app.pg.query(
    "select id from documents where filename = 'big.pdf'"
  )
  assert.strictEqual(rows.length, 0)
})

test('POST /documents with two file parts rejects and cleans up the first', async (t) => {
  const app = await build(t)

  let savedPath: string | undefined
  const originalSave = app.storage.save.bind(app.storage)
  app.storage.save = async (id, stream) => {
    const result = await originalSave(id, stream)
    savedPath = result.path
    return result
  }
  t.after(() => {
    app.storage.save = originalSave
  })

  const res = await app.inject({
    method: 'POST',
    url: '/documents',
    headers: multipartHeaders(),
    payload: multipartTwoFilesPayload()
  })

  assert.strictEqual(res.statusCode, 413)
  assert.ok(
    savedPath,
    'expected storage.save to have been called for the first file'
  )
  assert.strictEqual(existsSync(join(app.config.STORAGE_DIR, savedPath)), false)

  const { rows } = await app.pg.query(
    "select id from documents where filename in ('one.pdf', 'two.pdf')"
  )
  assert.strictEqual(rows.length, 0)
})
