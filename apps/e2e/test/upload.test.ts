/** End-to-end tests for the upload flow: the backend stores a document, the worker processes it, the backend serves the result. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import * as assert from 'node:assert'
import { startStack, waitFor } from './helper'

/** The backend's bundled 2-page PDF, also used by its `requests.http`. */
const SAMPLE_PDF = join(__dirname, '../../backend/samples/text.pdf')

interface Page {
  page_number: number
  text: string
}

test("an uploaded PDF's text is served once the worker has processed it", async (t) => {
  const baseUrl = await startStack(t)

  // upload
  const form = new FormData()
  form.append(
    'file',
    new Blob([await readFile(SAMPLE_PDF)], { type: 'application/pdf' }),
    'text.pdf'
  )
  const upload = await fetch(`${baseUrl}/documents`, {
    method: 'POST',
    body: form
  })
  assert.strictEqual(upload.status, 201)
  const { id } = (await upload.json()) as { id: string }

  // read the pages back once the worker has saved them
  const pages = await waitFor(
    'the worker to save the pages',
    async () => {
      const res = await fetch(`${baseUrl}/documents/${id}/pages`)
      assert.strictEqual(res.status, 200)
      const body = (await res.json()) as Page[]
      return body.length > 0 ? body : undefined
    },
    30_000
  )

  assert.deepStrictEqual(pages, [
    {
      page_number: 1,
      text: 'Employment contract between Jane Doe and Example Ltd. Start date: 1 March 2026.'
    },
    {
      page_number: 2,
      text: 'Notice period: three months. Salary is paid monthly.'
    }
  ])
})
