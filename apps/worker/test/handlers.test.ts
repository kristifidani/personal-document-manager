/** Tests for `handleJob`. Jobs are passed in directly and never inserted, so the queue stays empty. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { Pool } from 'pg'
import type { Config } from '../src/env'
import { handleJob } from '../src/handlers'
import {
  captureLogs,
  connect,
  createDocument,
  readPages,
  sample
} from './helper'

/** The text layer of `samples/text.pdf`, as the worker reads it. */
const CONTRACT_PAGES = [
  'Employment Contract\nbetween Example Ltd and Jane Doe\n1. Position. Jane Doe is employed as Software Engineer.\n2. Start date. Employment starts on 1 March 2026.\n3. Salary. The gross annual salary is GBP 52,000, paid monthly.',
  '4. Notice period. Either party may end the contract with three months notice.\n5. Holidays. Jane Doe is entitled to 25 working days of paid holiday per year.\n6. Governing law. This contract is governed by the law of England and Wales.'
]

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
  const documentId = await createDocument(pool, config, sample('text.pdf'))

  await extract(pool, config, documentId)

  assert.deepStrictEqual(await readPages(pool, documentId), [
    { page_number: 1, text: CONTRACT_PAGES[0] },
    { page_number: 2, text: CONTRACT_PAGES[1] }
  ])
})

test('extract replaces the saved pages when it runs again', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, sample('text.pdf'))
  // pages from an earlier run, one more than the file has now
  await pool.query(
    `insert into document_pages (document_id, page_number, text)
     values ($1, 1, 'Old page'), ($1, 2, 'Old page'), ($1, 3, 'Old page')`,
    [documentId]
  )

  await extract(pool, config, documentId)

  assert.deepStrictEqual(await readPages(pool, documentId), [
    { page_number: 1, text: CONTRACT_PAGES[0] },
    { page_number: 2, text: CONTRACT_PAGES[1] }
  ])
})

test('extract reads an image with OCR', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, sample('photo.jpg'))

  const { logged } = await captureLogs(() => extract(pool, config, documentId))

  // OCR output varies in spacing and case, so match the receipt's total
  const pages = await readPages(pool, documentId)
  assert.strictEqual(pages.length, 1)
  assert.match(pages[0]?.text ?? '', /total\s*gbp\s*8\.50/i)

  // the log has the request's cost and none of the text
  const finished = logged.find((line) => line.msg === 'OCR finished')
  assert.ok(Number(finished?.input_tokens) > 0)
  assert.ok(Number(finished?.output_tokens) > 0)
  assert.doesNotMatch(JSON.stringify(logged), /total\s*gbp/i)
})

test('extract reads a scanned PDF with OCR', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, sample('scanned.pdf'))

  await extract(pool, config, documentId)

  const [first, second, ...rest] = await readPages(pool, documentId)
  assert.match(first?.text ?? '', /rechnung\s*nr\.?\s*2026-1042/i)
  assert.match(second?.text ?? '', /01\.11\.2026/)
  assert.deepStrictEqual(rest, [])
})

test('extract never sends a PDF with a text layer to OCR', async (t) => {
  const { pool, config } = connect(t)
  // page 1 has a text layer, page 2 is a scan
  const documentId = await createDocument(pool, config, sample('mixed.pdf'))

  // an invalid key fails any OCR request, so success proves none was made
  await extract(pool, { ...config, ANTHROPIC_API_KEY: 'invalid' }, documentId)

  assert.deepStrictEqual(await readPages(pool, documentId), [
    { page_number: 1, text: CONTRACT_PAGES[0] },
    { page_number: 2, text: '' }
  ])
})

test('extract rejects when the OCR request fails', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, sample('photo.jpg'))

  await assert.rejects(
    extract(pool, { ...config, ANTHROPIC_API_KEY: 'invalid' }, documentId),
    (err: Error) => {
      assert.strictEqual(err.message, 'OCR request failed')
      assert.ok(err.cause instanceof Anthropic.AuthenticationError)
      return true
    }
  )
})

test('extract rejects a mime type it cannot read', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, {
    content: Buffer.from('plain text'),
    mimeType: 'text/plain'
  })

  await assert.rejects(extract(pool, config, documentId), {
    message: 'Unsupported mime type: text/plain'
  })
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
