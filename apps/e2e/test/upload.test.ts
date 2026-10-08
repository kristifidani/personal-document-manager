/** End-to-end tests for the upload flow: the backend stores a document, the worker processes it, the backend serves the result. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import * as assert from 'node:assert'
import { startStack, waitFor } from './helper'

/** The repo's shared sample documents. */
const SAMPLES_DIR = join(__dirname, '../../../samples')

interface Page {
  page_number: number
  text: string
}

/** A sample and a pattern each of its pages must match; OCR output varies in spacing and case. */
interface Case {
  file: string
  mimeType: string
  pages: RegExp[]
}

const CASES: Case[] = [
  {
    file: 'text.pdf',
    mimeType: 'application/pdf',
    pages: [/starts on 1 March 2026/, /three months notice/]
  },
  {
    file: 'scanned.pdf',
    mimeType: 'application/pdf',
    pages: [/rechnung\s*nr\.?\s*2026-1042/i, /01\.11\.2026/]
  },
  {
    file: 'photo.jpg',
    mimeType: 'image/jpeg',
    pages: [/total\s*gbp\s*8\.50/i]
  }
]

/** Uploads a sample and waits until the worker has saved its pages. */
async function uploadAndReadPages(baseUrl: string, { file, mimeType }: Case) {
  // upload
  const form = new FormData()
  form.append(
    'file',
    new Blob([await readFile(join(SAMPLES_DIR, file))], { type: mimeType }),
    file
  )
  const upload = await fetch(`${baseUrl}/documents`, {
    method: 'POST',
    body: form
  })
  assert.strictEqual(upload.status, 201)
  const { id } = (await upload.json()) as { id: string }

  // read the pages back once the worker has saved them
  return waitFor(
    `the worker to save the pages of ${file}`,
    async () => {
      const res = await fetch(`${baseUrl}/documents/${id}/pages`)
      assert.strictEqual(res.status, 200)
      const body = (await res.json()) as Page[]
      return body.length > 0 ? body : undefined
    },
    60_000
  )
}

test("an uploaded document's text is served once the worker has processed it", async (t) => {
  const baseUrl = await startStack(t)

  for (const sample of CASES) {
    await t.test(sample.file, async () => {
      const pages = await uploadAndReadPages(baseUrl, sample)

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
