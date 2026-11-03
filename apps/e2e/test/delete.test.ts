/** End-to-end test for deleting a document while the worker is processing it. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  appOutput,
  readSample,
  startStack,
  upload,
  uploadAndWait,
  waitForStatus
} from './helper'

test('a document deleted while the worker processes it is gone, and the worker keeps working', async (t) => {
  const baseUrl = await startStack(t)
  const file = await readSample('employment-contract-signed.pdf')

  // delete while a job runs; wherever the job is, the outcome must be the same
  const { id } = await upload(baseUrl, file)
  await waitForStatus(baseUrl, id, ['processing'])
  const deleted = await fetch(`${baseUrl}/documents/${id}`, {
    method: 'DELETE'
  })
  assert.strictEqual(deleted.status, 204)
  const fetched = await fetch(`${baseUrl}/documents/${id}`)
  assert.strictEqual(fetched.status, 404)

  // the same file uploads again and the worker still finishes it
  const again = await uploadAndWait(baseUrl, file)
  assert.strictEqual(again.status, 'done', appOutput())
})
