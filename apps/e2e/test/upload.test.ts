/** End-to-end tests for the upload flow: the backend stores a document, the worker processes it, the backend serves the result. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import * as assert from 'node:assert'
import { startStack, waitFor } from './helper'

/** The backend's bundled samples, also used by its `requests.http`. */
const SAMPLES_DIR = join(__dirname, '../../backend/samples')

interface Page {
  page_number: number
  text: string
}

/** One upload and what each of its pages must read: a string is the exact text layer, a pattern an OCR transcription, whose spacing and case can vary. */
interface Case {
  file: string
  mimeType: string
  pages: (string | RegExp)[]
}

const CASES: Case[] = [
  {
    file: 'text.pdf',
    mimeType: 'application/pdf',
    pages: [
      'Employment contract between Jane Doe and Example Ltd. Start date: 1 March 2026.',
      'Notice period: three months. Salary is paid monthly.'
    ]
  },
  {
    file: 'scanned.pdf',
    mimeType: 'application/pdf',
    pages: [/invoice no\.?\s*1042/i, /pay by\s*01\.11\.2026/i]
  },
  {
    file: 'image.png',
    mimeType: 'image/png',
    pages: [/total\s*3\.50\s*eur/i]
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
      for (const [i, expected] of sample.pages.entries()) {
        const text = pages[i]?.text ?? ''
        if (typeof expected === 'string') assert.strictEqual(text, expected)
        else assert.match(text, expected)
      }
    })
  }
})
