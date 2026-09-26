/** Tests for the `/documents` routes against a real database and storage dir. */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import * as assert from 'node:assert'
// Type-only: see the matching note in test/migrations/schema.test.ts.
import '@fastify/postgres'
import '../../src/plugins/env'
import '../../src/plugins/storage'
import { type App, build } from '../helper'

const BOUNDARY = 'test-boundary'

/** One file part of a multipart upload. */
interface FilePart {
  filename: string
  mimeType: string
  content: Buffer
}

interface DocumentResponse {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: string
}

interface JobRow {
  job_type: string
  status: string
}

function pdf(filename: string, content = Buffer.from('%PDF')): FilePart {
  return { filename, mimeType: 'application/pdf', content }
}

/** Sends `POST /documents` with one `file` form field per part; no parts sends an empty form. */
function postDocuments(app: App, ...parts: FilePart[]) {
  const payload = Buffer.concat([
    ...parts.flatMap(({ filename, mimeType, content }) => [
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      ),
      content,
      Buffer.from('\r\n')
    ]),
    Buffer.from(`--${BOUNDARY}--\r\n`)
  ])

  return app.inject({
    method: 'POST',
    url: '/documents',
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    payload
  })
}

/**
 * Spies on `storage.save()` to learn the storage path of a rejected upload, which the error response omits (a directory snapshot would be flaky: test files run in parallel).
 * @returns a getter for the saved path, `undefined` until `save()` runs.
 */
function spyOnSave(app: App) {
  let savedPath: string | undefined
  const originalSave = app.storage.save.bind(app.storage)
  app.storage.save = async (id, stream) => {
    const result = await originalSave(id, stream)
    savedPath = result.path
    return result
  }
  return () => savedPath
}

test('POST /documents stores the file and enqueues a job, and GET /documents/:id returns it', async (t) => {
  const app = await build(t)
  const content = Buffer.from('%PDF-1.4 fake pdf content')

  // upload
  const res = await postDocuments(app, pdf('test.pdf', content))

  assert.strictEqual(res.statusCode, 201)
  const body = res.json<DocumentResponse>()

  assert.strictEqual(body.filename, 'test.pdf')
  assert.strictEqual(body.mime_type, 'application/pdf')
  assert.strictEqual(body.size_bytes, content.length)
  assert.ok(body.id)
  assert.ok(body.created_at)

  // file stored and job enqueued
  const { rows: documentRows } = await app.pg.query<{ storage_path: string }>(
    'select storage_path from documents where id = $1',
    [body.id]
  )
  const storagePath = documentRows[0]?.storage_path
  assert.ok(storagePath)
  assert.ok(existsSync(join(app.config.STORAGE_DIR, storagePath)))

  const { rows: jobs } = await app.pg.query<JobRow>(
    'select * from jobs where document_id = $1',
    [body.id]
  )

  assert.strictEqual(jobs.length, 1)
  assert.strictEqual(jobs[0].job_type, 'extract')
  assert.strictEqual(jobs[0].status, 'pending')

  // read it back
  const fetched = await app.inject({
    method: 'GET',
    url: `/documents/${body.id}`
  })
  assert.strictEqual(fetched.statusCode, 200)
  assert.deepStrictEqual(fetched.json(), body)
})

test('POST /documents without a file returns 400', async (t) => {
  const app = await build(t)

  const res = await postDocuments(app)

  assert.strictEqual(res.statusCode, 400)
})

test('POST /documents with an unsupported mime type returns 415 and creates nothing', async (t) => {
  const app = await build(t)
  const savedPath = spyOnSave(app)

  const res = await postDocuments(app, {
    filename: 'test.txt',
    mimeType: 'text/plain',
    content: Buffer.from('hello')
  })

  assert.strictEqual(res.statusCode, 415)
  // the row is inserted only after the file is saved, so no save means no row
  assert.strictEqual(savedPath(), undefined)
})

test('POST /documents with an oversized file returns 413 and cleans up', async (t) => {
  const app = await build(t)
  const savedPath = spyOnSave(app)

  const res = await postDocuments(
    app,
    pdf('big.pdf', Buffer.alloc(20 * 1024 * 1024 + 1, 'a'))
  )

  assert.strictEqual(res.statusCode, 413)
  const path = savedPath()
  assert.ok(path, 'expected storage.save to have been called')
  const { rows } = await app.pg.query(
    'select id from documents where storage_path = $1',
    [path]
  )
  assert.strictEqual(rows.length, 0)
  assert.strictEqual(existsSync(join(app.config.STORAGE_DIR, path)), false)
})

test('POST /documents with two file parts rejects and cleans up the first', async (t) => {
  const app = await build(t)
  const savedPath = spyOnSave(app)

  const res = await postDocuments(app, pdf('one.pdf'), pdf('two.pdf'))

  assert.strictEqual(res.statusCode, 413)
  const path = savedPath()
  assert.ok(path, 'expected storage.save to have been called')
  const { rows } = await app.pg.query(
    'select id from documents where storage_path = $1',
    [path]
  )
  assert.strictEqual(rows.length, 0)
  assert.strictEqual(existsSync(join(app.config.STORAGE_DIR, path)), false)
})

test('GET /documents lists newest first', async (t) => {
  const app = await build(t)
  const older = (
    await postDocuments(app, pdf('older.pdf'))
  ).json<DocumentResponse>()
  const newer = (
    await postDocuments(app, pdf('newer.pdf'))
  ).json<DocumentResponse>()

  const res = await app.inject({ method: 'GET', url: '/documents' })
  const ids = res.json<DocumentResponse[]>().map((document) => document.id)

  const newerIndex = ids.indexOf(newer.id)
  assert.ok(newerIndex !== -1, 'expected the newer document to be listed')
  assert.ok(newerIndex < ids.indexOf(older.id))
})

test('GET /documents/:id for an unknown id returns 404', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    method: 'GET',
    url: `/documents/${randomUUID()}`
  })

  assert.strictEqual(res.statusCode, 404)
})

test('GET /documents/:id with a malformed id returns 400', async (t) => {
  const app = await build(t)

  const res = await app.inject({ method: 'GET', url: '/documents/not-a-uuid' })

  assert.strictEqual(res.statusCode, 400)
})
