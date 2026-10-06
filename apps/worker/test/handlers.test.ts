/** Tests for `handleJob`. Jobs are passed in directly and never inserted, so the queue stays empty. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { Config } from '../src/env'
import { handleJob } from '../src/handlers'
import { connect, createDocument, pdf, readPages } from './helper'

/** Runs the `extract` handler for a document. */
function extract(pool: Pool, config: Config, documentId: string) {
  return handleJob(pool, config, {
    id: randomUUID(),
    document_id: documentId,
    job_type: 'extract'
  })
}

test('extract saves the text of each PDF page', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, {
    content: pdf(['First page', 'Second page']),
    mimeType: 'application/pdf'
  })

  await extract(pool, config, documentId)

  assert.deepStrictEqual(await readPages(pool, documentId), [
    { page_number: 1, text: 'First page' },
    { page_number: 2, text: 'Second page' }
  ])
})

test('extract replaces the saved pages when it runs again', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, {
    content: pdf(['Only page']),
    mimeType: 'application/pdf'
  })
  // pages from an earlier run, one more than the file has now
  await pool.query(
    `insert into document_pages (document_id, page_number, text)
     values ($1, 1, 'Old page'), ($1, 2, 'Old page')`,
    [documentId]
  )

  await extract(pool, config, documentId)

  assert.deepStrictEqual(await readPages(pool, documentId), [
    { page_number: 1, text: 'Only page' }
  ])
})

test('extract saves no pages for an image', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, {
    content: Buffer.from('not really a png'),
    mimeType: 'image/png'
  })

  await extract(pool, config, documentId)

  assert.deepStrictEqual(await readPages(pool, documentId), [])
})

test('extract rejects a file that is not a valid PDF', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, {
    content: Buffer.from('not a pdf'),
    mimeType: 'application/pdf'
  })

  await assert.rejects(extract(pool, config, documentId), (err: Error) => {
    assert.strictEqual(err.message, 'Could not read the PDF text layer')
    assert.strictEqual((err.cause as Error).name, 'InvalidPDFException')
    return true
  })
})

test('extract rejects when the stored file is missing', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, null)

  await assert.rejects(extract(pool, config, documentId), { code: 'ENOENT' })
})

test('rejects an unknown job type', async (t) => {
  const { pool, config } = connect(t)

  await assert.rejects(
    handleJob(pool, config, {
      id: randomUUID(),
      document_id: randomUUID(),
      job_type: 'unknown'
    }),
    /Unknown job type: unknown/
  )
})
