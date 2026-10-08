/** Tests for `handleJob`. Jobs are passed in directly and never inserted, so the queue stays empty. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { Pool } from 'pg'
import type { Config } from '../src/env'
import { handleJob } from '../src/handlers'
import {
  SCANNED_TEXT,
  connect,
  createDocument,
  pdf,
  png,
  readPages,
  scan
} from './helper'

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

test('extract reads an image with OCR', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, {
    content: png(scan(SCANNED_TEXT)),
    mimeType: 'image/png'
  })

  await extract(pool, config, documentId)

  const pages = await readPages(pool, documentId)
  assert.strictEqual(pages.length, 1)
  assert.match(pages[0]?.text ?? '', /HELLO\s+WORLD/i)
})

test('extract reads PDF pages without a text layer with OCR', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, {
    content: pdf(['First page', scan(SCANNED_TEXT)]),
    mimeType: 'application/pdf'
  })

  await extract(pool, config, documentId)

  // the text-layer page keeps its exact text; the scanned page gets the transcription
  const [first, second, ...rest] = await readPages(pool, documentId)
  assert.deepStrictEqual(first, { page_number: 1, text: 'First page' })
  assert.strictEqual(second?.page_number, 2)
  assert.match(second.text, /HELLO\s+WORLD/i)
  assert.deepStrictEqual(rest, [])
})

test('extract rejects when the OCR request fails', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, {
    content: png(scan(SCANNED_TEXT)),
    mimeType: 'image/png'
  })

  await assert.rejects(
    extract(pool, { ...config, ANTHROPIC_API_KEY: 'invalid' }, documentId),
    (err: Error) => {
      assert.strictEqual(err.message, 'OCR request failed')
      assert.ok(err.cause instanceof Anthropic.AuthenticationError)
      return true
    }
  )
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
