/** Tests for the `/ask` route against a real database and the real Claude API. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { type App, build, type ErrorResponse, insertDocument } from '../helper'

interface AskResponse {
  documents: { document_id: string; title: string; document_type: string }[]
  answer: string | null
  citations: { document_id: string; page: number }[]
}

/** Inserts a classified document with its pages, as upload and the worker would leave it, and returns its id. */
async function insertClassified(
  app: App,
  classification: { document_type: string; title: string; summary: string },
  pages: string[] = []
) {
  const id = await insertDocument(app, classification)
  for (const [index, text] of pages.entries()) {
    await app.pg.query(
      'insert into document_pages (document_id, page_number, text) values ($1, $2, $3)',
      [id, index + 1, text]
    )
  }
  return id
}

function postAsk(app: App, body: object) {
  return app.inject({ method: 'POST', url: '/ask', payload: body })
}

// Earlier test files leave classified documents in the database, so these tests only check their own rows.

test('POST /ask returns the documents that answer the question, an answer and the pages it cites', async (t) => {
  const app = await build(t)
  // the question needs two documents, so each citation must name the right one:
  // the salary is on page 3 of the contract, after an empty page (a scanned page of a mixed PDF); the net pay is on page 2 of the payslip
  const contract = await insertClassified(
    app,
    {
      document_type: 'contract',
      title: 'Employment contract with Quillfeather Robotics GmbH',
      summary:
        'Employment contract between Jane Example and Quillfeather Robotics GmbH for a software engineer role, starting 1 March 2026 with a salary of EUR 60,000 a year.'
    },
    [
      'Employment contract between Quillfeather Robotics GmbH and Jane Example. Jane Example is employed as a software engineer from 1 March 2026.',
      '',
      'Salary. The employee is paid EUR 60,000 a year, in twelve monthly instalments.'
    ]
  )
  const payslip = await insertClassified(
    app,
    {
      document_type: 'payslip',
      title: 'Payslip from Quillfeather Robotics GmbH, March 2026',
      summary:
        'Payslip from Quillfeather Robotics GmbH to Jane Example for March 2026, with a net pay of EUR 3,620.'
    },
    [
      'Quillfeather Robotics GmbH. Payslip for Jane Example, March 2026.',
      'Gross pay EUR 5,000. Tax and insurance EUR 1,380. Net pay EUR 3,620.'
    ]
  )
  const invoice = await insertClassified(
    app,
    {
      document_type: 'invoice',
      title: 'Dental invoice from Smile Clinic, June 2026',
      summary:
        'Invoice from Smile Clinic to Jane Example for a dental check-up on 12 June 2026, EUR 85, due 30 June 2026.'
    },
    ['Smile Clinic. Dental check-up on 12 June 2026: EUR 85, due 30 June 2026.']
  )

  const res = await postAsk(app, {
    question:
      'What yearly salary does Quillfeather Robotics pay me, and what was my net pay in March 2026?'
  })

  assert.strictEqual(res.statusCode, 200)
  const { documents, answer, citations } = res.json<AskResponse>()
  assert.deepStrictEqual(
    documents.find((hit) => hit.document_id === contract),
    {
      document_id: contract,
      title: 'Employment contract with Quillfeather Robotics GmbH',
      document_type: 'contract'
    }
  )
  assert.ok(documents.some((hit) => hit.document_id === payslip))
  assert.ok(!documents.some((hit) => hit.document_id === invoice))
  // the model's wording varies, so only the amounts are checked
  assert.match(answer ?? '', /60[,.]?000/)
  assert.match(answer ?? '', /3[,.]?620/)
  // Claude may cite other pages too; the ones holding the facts must be among them, and the empty page 2 is never sent
  const citedPages = (id: string) =>
    citations
      .filter((citation) => citation.document_id === id)
      .map((citation) => citation.page)
  const all = JSON.stringify(citations)
  assert.ok(citedPages(contract).includes(3), all)
  assert.ok(!citedPages(contract).includes(2), all)
  assert.ok(citedPages(payslip).includes(2), all)
  assert.deepStrictEqual(citedPages(invoice), [])
})

test('POST /ask answers null when no document is relevant', async (t) => {
  const app = await build(t)
  await insertClassified(
    app,
    {
      document_type: 'receipt',
      title: 'Café receipt',
      summary: 'Receipt for a coffee and a croissant, GBP 8.50.'
    },
    ['Coffee GBP 4.00, croissant GBP 4.50, total GBP 8.50.']
  )

  const res = await postAsk(app, { question: 'What is my passport number?' })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), {
    documents: [],
    answer: null,
    citations: []
  })
})

test('POST /ask with no classified documents returns an empty list without calling Claude', async (t) => {
  const app = await build(t)
  // empty the catalogue; test files run serially, so no other file is using these rows
  await app.pg.query(
    'update documents set document_type = null, title = null, summary = null'
  )
  // an invalid key fails any request, so a 200 proves none was made
  app.config.ANTHROPIC_API_KEY = 'invalid'

  const res = await postAsk(app, { question: 'Where is my contract?' })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), {
    documents: [],
    answer: null,
    citations: []
  })
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
