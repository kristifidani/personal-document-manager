/** End-to-end test for deleting a document while the worker is processing it. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  appOutput,
  SAMPLES_DIR,
  startStack,
  upload,
  uploadAndWait,
  waitForStatus
} from './helper'

test('a document deleted while the worker processes it is gone, and the worker keeps working', async (t) => {
  const baseUrl = await startStack(t)
  // a sample no other test uploads: data is reset once per run, so a shared one would be a duplicate
  const content = await readFile(join(SAMPLES_DIR, 'mixed.pdf'))

  // delete while a job runs; wherever the job is, the outcome must be the same
  const { id } = await upload(baseUrl, 'mixed.pdf', 'application/pdf', content)
  await waitForStatus(baseUrl, id, ['processing'])
  const deleted = await fetch(`${baseUrl}/documents/${id}`, {
    method: 'DELETE'
  })
  assert.strictEqual(deleted.status, 204)
  const fetched = await fetch(`${baseUrl}/documents/${id}`)
  assert.strictEqual(fetched.status, 404)

  // the same file uploads again and the worker still finishes it
  const again = await uploadAndWait(
    baseUrl,
    'mixed.pdf',
    'application/pdf',
    content
  )
  assert.strictEqual(again.status, 'done', appOutput())
})
