/** End-to-end test for Ask: the worker classifies an upload, then the backend answers a question from it. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { appOutput, readSample, startStack, uploadAndWait } from './helper'

interface AskResponse {
  documents: { document_id: string }[]
  answer: string | null
  citations: { document_id: string; page: number }[]
}

test('a question about an uploaded document is answered, citing the page it comes from', async (t) => {
  const baseUrl = await startStack(t)
  const document = await uploadAndWait(
    baseUrl,
    await readSample('tenancy-agreement.pdf')
  )
  assert.strictEqual(document.status, 'done', appOutput())

  const res = await fetch(`${baseUrl}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'How much notice do I need to give my landlord?'
    })
  })

  assert.strictEqual(res.status, 200, appOutput())
  const { documents, answer, citations } = (await res.json()) as AskResponse
  assert.ok(documents.some((hit) => hit.document_id === document.id))
  // the model's wording varies; the notice clause says two months
  assert.match(answer ?? '', /two months|2 months/i)
  // the notice clause is on page 2
  assert.ok(
    citations.some(
      (citation) => citation.document_id === document.id && citation.page === 2
    ),
    `citations: ${JSON.stringify(citations)}`
  )
})
