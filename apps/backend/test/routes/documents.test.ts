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
  status: string
}

interface ErrorResponse {
  code: string
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
  assert.strictEqual(body.status, 'pending')
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
    'select job_type, status from jobs where document_id = $1',
    [body.id]
  )

  assert.deepStrictEqual(jobs, [{ job_type: 'extract', status: 'pending' }])

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
  assert.strictEqual(res.json<ErrorResponse>().code, 'NO_FILE_PROVIDED')
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
  assert.strictEqual(res.json<ErrorResponse>().code, 'UNSUPPORTED_MIME_TYPE')
  // the row is inserted only after the file is saved, so no save means no row
  assert.strictEqual(savedPath(), undefined)
})

test('POST /documents with an oversized file returns 413 and cleans up', async (t) => {
  // each type's limit plus one byte: PDFs hit the parser's cap, images the route's lower limit
  const files: FilePart[] = [
    pdf('big.pdf', Buffer.alloc(10 * 1024 * 1024 + 1, 'a')),
    {
      filename: 'big.png',
      mimeType: 'image/png',
      content: Buffer.alloc(5 * 1024 * 1024 + 1, 'a')
    }
  ]
  for (const file of files) {
    await t.test(file.filename, async (t) => {
      const app = await build(t)
      const savedPath = spyOnSave(app)

      const res = await postDocuments(app, file)

      assert.strictEqual(res.statusCode, 413)
      assert.strictEqual(res.json<ErrorResponse>().code, 'FILE_TOO_LARGE')
      const path = savedPath()
      assert.ok(path, 'expected storage.save to have been called')
      const { rows } = await app.pg.query(
        'select id from documents where storage_path = $1',
        [path]
      )
      assert.strictEqual(rows.length, 0)
      assert.strictEqual(existsSync(join(app.config.STORAGE_DIR, path)), false)
    })
  }
})

test('POST /documents with two file parts rejects and cleans up the first', async (t) => {
  const app = await build(t)
  const savedPath = spyOnSave(app)

  const res = await postDocuments(app, pdf('one.pdf'), pdf('two.pdf'))

  assert.strictEqual(res.statusCode, 413)
  // raised by `@fastify/multipart`, not by the route
  assert.strictEqual(res.json<ErrorResponse>().code, 'FST_FILES_LIMIT')
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

/** Reads the document through both read routes and asserts each returns exactly `expected`. */
async function assertDocument(app: App, expected: DocumentResponse) {
  const one = await app.inject({
    method: 'GET',
    url: `/documents/${expected.id}`
  })
  assert.deepStrictEqual(one.json(), expected)

  const list = await app.inject({ method: 'GET', url: '/documents' })
  assert.deepStrictEqual(
    list
      .json<DocumentResponse[]>()
      .find((document) => document.id === expected.id),
    expected
  )
}

test("a document's status follows its job, without the job's error", async (t) => {
  const app = await build(t)
  // the states the worker moves a job through
  const cases = [
    { status: 'processing', error: null },
    { status: 'done', error: null },
    { status: 'failed', error: "ENOENT: open '/srv/storage/some-id'" }
  ]
  for (const { status, error } of cases) {
    await t.test(status, async () => {
      const document = (
        await postDocuments(app, pdf(`${status}.pdf`))
      ).json<DocumentResponse>()
      await app.pg.query(
        'update jobs set status = $2, error = $3 where document_id = $1',
        [document.id, status, error]
      )

      await assertDocument(app, { ...document, status })
    })
  }
})

test('a document with several jobs is failed if any failed, else as far along as its slowest job, and done with none', async (t) => {
  const app = await build(t)
  const cases = [
    { jobs: [], status: 'done' },
    { jobs: ['done', 'pending'], status: 'pending' },
    { jobs: ['pending', 'done', 'processing'], status: 'processing' },
    { jobs: ['processing', 'failed', 'done'], status: 'failed' }
  ]
  for (const { jobs, status } of cases) {
    await t.test(`${jobs.join(' + ') || 'no jobs'} is ${status}`, async () => {
      const document = (
        await postDocuments(app, pdf('jobs.pdf'))
      ).json<DocumentResponse>()
      // replace the upload's job with this case's
      await app.pg.query('delete from jobs where document_id = $1', [
        document.id
      ])
      for (const jobStatus of jobs) {
        await app.pg.query(
          'insert into jobs (document_id, job_type, status) values ($1, $2, $3)',
          [document.id, 'extract', jobStatus]
        )
      }

      await assertDocument(app, { ...document, status })
    })
  }
})

test('GET /documents/:id for an unknown id returns 404', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    method: 'GET',
    url: `/documents/${randomUUID()}`
  })

  assert.strictEqual(res.statusCode, 404)
  assert.deepStrictEqual(res.json(), {
    code: 'DOCUMENT_NOT_FOUND',
    message: 'Document not found'
  })
})

test('GET /documents/:id with a malformed id returns 400', async (t) => {
  const app = await build(t)

  const res = await app.inject({ method: 'GET', url: '/documents/not-a-uuid' })

  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json<ErrorResponse>().code, 'FST_ERR_VALIDATION')
})

test('GET /documents/:id/pages returns the saved pages in page order', async (t) => {
  const app = await build(t)
  const document = (
    await postDocuments(app, pdf('contract.pdf'))
  ).json<DocumentResponse>()
  // the rows the worker's extract job saves, inserted out of order
  await app.pg.query(
    `insert into document_pages (document_id, page_number, text)
     values ($1, 2, 'Second page'), ($1, 1, 'First page')`,
    [document.id]
  )

  const res = await app.inject({
    method: 'GET',
    url: `/documents/${document.id}/pages`
  })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), [
    { page_number: 1, text: 'First page' },
    { page_number: 2, text: 'Second page' }
  ])
})

test('GET /documents/:id/pages returns an empty list before any text is saved', async (t) => {
  const app = await build(t)
  const document = (
    await postDocuments(app, pdf('new.pdf'))
  ).json<DocumentResponse>()

  const res = await app.inject({
    method: 'GET',
    url: `/documents/${document.id}/pages`
  })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), [])
})

test('GET /documents/:id/pages for an unknown id returns 404', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    method: 'GET',
    url: `/documents/${randomUUID()}/pages`
  })

  assert.strictEqual(res.statusCode, 404)
  assert.strictEqual(res.json<ErrorResponse>().code, 'DOCUMENT_NOT_FOUND')
})

test('GET /documents/:id/pages with a malformed id returns 400', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    method: 'GET',
    url: '/documents/not-a-uuid/pages'
  })

  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json<ErrorResponse>().code, 'FST_ERR_VALIDATION')
})
