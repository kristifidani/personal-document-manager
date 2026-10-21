/** Tests for `handleJob`. Jobs are passed in directly, and the jobs a handler queues are removed, so the queue stays empty for other test files. */
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
  readClassification,
  readPages,
  sample,
  savePages
} from './helper'

/** The text layer of `samples/text.pdf`, as the worker reads it. */
const CONTRACT_PAGES = [
  'Employment Contract\nbetween Example Ltd and Jane Doe\n1. Position. Jane Doe is employed as Software Engineer.\n2. Start date. Employment starts on 1 March 2026.\n3. Salary. The gross annual salary is GBP 52,000, paid monthly.',
  '4. Notice period. Either party may end the contract with three months notice.\n5. Holidays. Jane Doe is entitled to 25 working days of paid holiday per year.\n6. Governing law. This contract is governed by the law of England and Wales.'
]

/** Runs `job_type`'s handler for a document, then removes the jobs it queued. @returns their types and statuses. */
async function runHandler(
  pool: Pool,
  config: Config,
  jobType: string,
  documentId: string
) {
  await handleJob(pool, config, {
    id: randomUUID(),
    document_id: documentId,
    job_type: jobType
  })
  const { rows } = await pool.query<{ job_type: string; status: string }>(
    'delete from jobs where document_id = $1 returning job_type, status',
    [documentId]
  )
  return rows
}

/** Runs the `extract` handler for a document. */
function extract(pool: Pool, config: Config, documentId: string) {
  return runHandler(pool, config, 'extract', documentId)
}

/** Runs the `classify` handler for a document. */
function classify(pool: Pool, config: Config, documentId: string) {
  return runHandler(pool, config, 'classify', documentId)
}

test('extract saves the text of each PDF page and queues classify', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, sample('text.pdf'))

  const queued = await extract(pool, config, documentId)

  assert.deepStrictEqual(await readPages(pool, documentId), [
    { page_number: 1, text: CONTRACT_PAGES[0] },
    { page_number: 2, text: CONTRACT_PAGES[1] }
  ])
  assert.deepStrictEqual(queued, [{ job_type: 'classify', status: 'pending' }])
})

test('extract replaces the saved pages when it runs again', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, sample('text.pdf'))
  // pages from an earlier run, one more than the file has now
  await savePages(pool, documentId, ['Old page', 'Old page', 'Old page'])

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

/** A German invoice's text, as extract would have saved it. */
const INVOICE_PAGES = [
  'Muster GmbH\nRechnung Nr. 2026-1042\nRechnungsdatum: 15.10.2026\nKunde: Max Mustermann\nLeistung: Reparatur Heizung, 2 Stunden\nGesamtbetrag: 240,00 EUR',
  'Zahlbar bis 01.11.2026 ohne Abzug auf das Konto DE12 3456 7890.'
]

test('classify saves what Claude reads from the pages, replacing an earlier result', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, sample('text.pdf'))
  await savePages(pool, documentId, CONTRACT_PAGES)
  // a result from an earlier run
  await pool.query(
    `update documents set document_type = 'other', title = 'Old title', summary = 'Old summary' where id = $1`,
    [documentId]
  )

  const { logged } = await captureLogs(() => classify(pool, config, documentId))

  // the model's wording varies, so check the facts the contract states
  const saved = await readClassification(pool, documentId)
  assert.strictEqual(saved?.document_type, 'contract')
  assert.match(saved.title, /contract/i)
  assert.match(saved.summary, /jane doe/i)
  assert.match(saved.summary, /software engineer/i)

  // the log has the request's cost and none of the text
  const finished = logged.find((line) => line.msg === 'Classification finished')
  assert.ok(Number(finished?.input_tokens) > 0)
  assert.doesNotMatch(JSON.stringify(logged), /jane doe/i)
})

test('classify summarises a document in another language in English', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, sample('text.pdf'))
  await savePages(pool, documentId, INVOICE_PAGES)

  await classify(pool, config, documentId)

  const saved = await readClassification(pool, documentId)
  assert.strictEqual(saved?.document_type, 'invoice')
  assert.match(saved.summary, /invoice/i)
  assert.match(saved.summary, /240/)
})

test('classify rejects a document with no text', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, sample('text.pdf'))
  await savePages(pool, documentId, ['', '  \n'])

  // an invalid key fails any request, so the message proves none was made
  await assert.rejects(
    classify(pool, { ...config, ANTHROPIC_API_KEY: 'invalid' }, documentId),
    { message: 'Document has no text to classify' }
  )
  assert.strictEqual(await readClassification(pool, documentId), undefined)
})

test('classify rejects when the request fails', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, sample('text.pdf'))
  await savePages(pool, documentId, CONTRACT_PAGES)

  await assert.rejects(
    classify(pool, { ...config, ANTHROPIC_API_KEY: 'invalid' }, documentId),
    (err: Error) => {
      assert.strictEqual(err.message, 'Classification request failed')
      assert.ok(err.cause instanceof Anthropic.AuthenticationError)
      return true
    }
  )
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
