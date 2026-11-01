/** Tests for the `/ask` route against a real database and the real Claude API. */
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import * as assert from 'node:assert'
// Type-only: see the matching note in test/migrations/schema.test.ts.
import '@fastify/postgres'
import '../../src/plugins/env'
import { type App, build } from '../helper'

interface AskResponse {
  documents: { document_id: string; title: string; document_type: string }[]
}

interface ErrorResponse {
  code: string
}

/** A document's classification columns, as the worker's classify job sets them. */
interface Classification {
  document_type: string
  title: string
  summary: string
}

/** Inserts a classified document, as upload and the worker would leave it, and returns its id. */
async function insertClassified(app: App, classification: Classification) {
  const { rows } = await app.pg.query<{ id: string }>(
    `insert into documents (filename, mime_type, size_bytes, storage_path, content_sha256, document_type, title, summary)
     values ('test.pdf', 'application/pdf', 100, 'test-path', $1, $2, $3, $4)
     returning id`,
    [
      randomBytes(32).toString('hex'),
      classification.document_type,
      classification.title,
      classification.summary
    ]
  )
  const id = rows[0]?.id
  if (!id) throw new Error('Inserting the document returned no row')
  return id
}

function postAsk(app: App, body: unknown) {
  return app.inject({ method: 'POST', url: '/ask', payload: body as object })
}

// Other test files add classified documents to the same database at the same time, so these tests only check their own rows.

test('POST /ask returns the documents that answer the question', async (t) => {
  const app = await build(t)
  const contract = await insertClassified(app, {
    document_type: 'contract',
    title: 'Employment contract with Quillfeather Robotics GmbH',
    summary:
      'Employment contract between Jane Example and Quillfeather Robotics GmbH for a software engineer role, starting 1 March 2026 with a salary of EUR 60,000 a year.'
  })
  const invoice = await insertClassified(app, {
    document_type: 'invoice',
    title: 'Dental invoice from Smile Clinic, June 2026',
    summary:
      'Invoice from Smile Clinic to Jane Example for a dental check-up on 12 June 2026, EUR 85, due 30 June 2026.'
  })

  const res = await postAsk(app, {
    question: 'Where is my contract with Quillfeather Robotics?'
  })

  assert.strictEqual(res.statusCode, 200)
  const { documents } = res.json<AskResponse>()
  assert.deepStrictEqual(
    documents.find((hit) => hit.document_id === contract),
    {
      document_id: contract,
      title: 'Employment contract with Quillfeather Robotics GmbH',
      document_type: 'contract'
    }
  )
  assert.ok(!documents.some((hit) => hit.document_id === invoice))
})

test('POST /ask returns 502 when the Claude request fails', async (t) => {
  const app = await build(t)
  // the catalogue must hold a document, or there's nothing to send
  await insertClassified(app, {
    document_type: 'letter',
    title: 'Letter',
    summary: 'A letter.'
  })
  // the route reads the key per request; an invalid one fails at auth, before any tokens are billed
  app.config.ANTHROPIC_API_KEY = 'invalid'

  const res = await postAsk(app, { question: 'Where is my letter?' })

  assert.strictEqual(res.statusCode, 502)
  assert.deepStrictEqual(res.json(), {
    code: 'ASK_FAILED',
    message: 'Could not answer the question, try again later'
  })
})

test('POST /ask rejects an invalid body with 400', async (t) => {
  const app = await build(t)
  const cases = [
    { name: 'missing question', body: {} },
    { name: 'empty question', body: { question: '' } },
    { name: 'too long question', body: { question: 'a'.repeat(1001) } }
  ]

  for (const { name, body } of cases) {
    const res = await postAsk(app, body)
    assert.strictEqual(res.statusCode, 400, name)
    assert.strictEqual(
      res.json<ErrorResponse>().code,
      'FST_ERR_VALIDATION',
      name
    )
  }
})
