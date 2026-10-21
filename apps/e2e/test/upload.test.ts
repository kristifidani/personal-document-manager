/** End-to-end tests for the upload flow: the backend stores a document, the worker processes it, the backend serves the result. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import * as assert from 'node:assert'
import { appOutput, startStack, waitFor } from './helper'

/** The repo's shared sample documents. */
const SAMPLES_DIR = join(__dirname, '../../../samples')

interface Page {
  page_number: number
  text: string
}

/** A sample, a pattern each of its pages must match (OCR output varies in spacing and case), and the type it is classified as. */
interface Case {
  file: string
  mimeType: string
  pages: RegExp[]
  documentType: string
}

const CASES: Case[] = [
  {
    file: 'text.pdf',
    mimeType: 'application/pdf',
    pages: [/starts on 1 March 2026/, /three months notice/],
    documentType: 'contract'
  },
  {
    file: 'scanned.pdf',
    mimeType: 'application/pdf',
    pages: [/rechnung\s*nr\.?\s*2026-1042/i, /01\.11\.2026/],
    documentType: 'invoice'
  },
  {
    file: 'photo.jpg',
    mimeType: 'image/jpeg',
    pages: [/total\s*gbp\s*8\.50/i],
    documentType: 'receipt'
  }
]

/** A document as the API returns it: the fields these tests read. */
interface Document {
  id: string
  document_type: string | null
  title: string | null
  summary: string | null
  status: string
}

/**
 * Uploads a file and waits until the worker has finished with it.
 * @returns the document, with status `done` or `failed`.
 */
async function uploadAndWait(
  baseUrl: string,
  filename: string,
  mimeType: string,
  content: Buffer<ArrayBuffer>
) {
  // upload
  const form = new FormData()
  form.append('file', new Blob([content], { type: mimeType }), filename)
  const upload = await fetch(`${baseUrl}/documents`, {
    method: 'POST',
    body: form
  })
  assert.strictEqual(upload.status, 201)
  const { id } = (await upload.json()) as Document

  // poll the document until its job has finished
  return waitFor(
    `the worker to finish ${filename}`,
    async () => {
      const res = await fetch(`${baseUrl}/documents/${id}`)
      assert.strictEqual(res.status, 200)
      const document = (await res.json()) as Document
      return ['done', 'failed'].includes(document.status) ? document : undefined
    },
    60_000
  )
}

/** Reads a document's extracted pages. */
async function readPages(baseUrl: string, id: string) {
  const res = await fetch(`${baseUrl}/documents/${id}/pages`)
  assert.strictEqual(res.status, 200)
  return (await res.json()) as Page[]
}

test("an uploaded document's text and classification are served once the worker has processed it", async (t) => {
  const baseUrl = await startStack(t)

  for (const sample of CASES) {
    await t.test(sample.file, async () => {
      const document = await uploadAndWait(
        baseUrl,
        sample.file,
        sample.mimeType,
        await readFile(join(SAMPLES_DIR, sample.file))
      )
      assert.strictEqual(document.status, 'done', appOutput())

      // classification: the model's wording varies, so only the type is exact
      assert.strictEqual(document.document_type, sample.documentType)
      assert.ok(document.title, 'expected a title')
      assert.ok(document.summary, 'expected a summary')

      const pages = await readPages(baseUrl, document.id)
      assert.deepStrictEqual(
        pages.map((page) => page.page_number),
        sample.pages.map((_, i) => i + 1)
      )
      for (const [i, pattern] of sample.pages.entries()) {
        assert.match(pages[i]?.text ?? '', pattern)
      }
    })
  }
})

test('an uploaded file the worker cannot read ends failed, with no text or classification', async (t) => {
  const baseUrl = await startStack(t)

  const document = await uploadAndWait(
    baseUrl,
    'broken.pdf',
    'application/pdf',
    Buffer.from('not a pdf')
  )

  assert.strictEqual(document.status, 'failed')
  assert.strictEqual(document.document_type, null)
  assert.deepStrictEqual(await readPages(baseUrl, document.id), [])
})
