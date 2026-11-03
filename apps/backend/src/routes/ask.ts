import createError from '@fastify/error'
import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify'
import {
  requestCitedAnswer,
  requestJson,
  type SourceDocument
} from 'shared/claude'

/** Long enough for any real question, short enough to keep the request small. */
const MAX_QUESTION_LENGTH = 1000

const AskFailedError = createError(
  'ASK_FAILED',
  'Could not answer the question, try again later',
  502
)

/** Turns a failed Claude call into a 502; any other error stays a 500. */
function providerFailed(err: unknown): never {
  throw new AskFailedError({ cause: err })
}

/** A classified document as the catalogue holds it. */
interface CatalogueRow {
  id: string
  document_type: string
  title: string
  summary: string
}

/** One page of a picked document. */
interface PageRow {
  document_id: string
  page_number: number
  text: string
}

/** A picked document, as the response lists it. */
interface AskHit {
  document_id: string
  title: string
  document_type: string
}

/** Sonnet at low effort; it picked the right samples in a test run. */
const PICK_MODEL = 'claude-sonnet-5-5'

/** A short list of ids, plus room for thinking. */
const PICK_MAX_TOKENS = 16_000

const PICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_ids'],
  properties: {
    document_ids: { type: 'array', items: { type: 'string' } }
  }
}

const PICK_PROMPT = `Above is a catalogue of a person's documents, each in a <document> tag with its id and type, then its title on the first line and an English summary, followed by their question in a <question> tag.

Return the ids of the documents needed to answer the question, most relevant first. Return an empty list when none is relevant.`

/**
 * Step 1: Claude reads the catalogue and picks the documents that answer `question`, most relevant first.
 * @returns no documents, without a call, when the catalogue is empty (Claude rejects an empty block).
 */
async function pickDocuments(
  apiKey: string,
  log: FastifyBaseLogger,
  catalogue: CatalogueRow[],
  question: string
): Promise<AskHit[]> {
  if (catalogue.length === 0) return []
  const text = catalogue
    .map(
      (row) =>
        `<document id="${row.id}" type="${row.document_type}">\n${row.title}\n${row.summary}\n</document>`
    )
    .join('\n')
  const picked = (await requestJson(apiKey, log, {
    label: 'Ask retrieval',
    model: PICK_MODEL,
    maxTokens: PICK_MAX_TOKENS,
    effort: 'low',
    schema: PICK_SCHEMA,
    content: [
      { type: 'text', text },
      { type: 'text', text: `<question>\n${question}\n</question>` },
      { type: 'text', text: PICK_PROMPT }
    ],
    logFields: { catalogue_size: catalogue.length }
  }).catch(providerFailed)) as { document_ids: string[] }

  // keep catalogue ids only, once each, so a made-up id never reaches the client
  const byId = new Map(catalogue.map((row) => [row.id, row]))
  return [...new Set(picked.document_ids)].flatMap((id) => {
    const row = byId.get(id)
    return row
      ? [
          {
            document_id: id,
            title: row.title,
            document_type: row.document_type
          }
        ]
      : []
  })
}

/** Sonnet at low effort; it answered and cited the right sample pages in a test run. */
const ANSWER_MODEL = 'claude-sonnet-5-5'

/** A few sentences, plus room for thinking. */
const ANSWER_MAX_TOKENS = 16_000

const ANSWER_PROMPT = `Answer the question from the person's documents above. Use only what the documents say, and base each statement on the passages it comes from.

Answer briefly, in the language of the question. Don't name pages or documents in the answer: the sources are shown next to it. If the documents don't answer the question, or it could mean more than one thing, say so plainly. Don't give legal advice.`

/** Step 2: Claude reads the picked documents' pages and answers, citing the pages it used. */
function answerFromDocuments(
  apiKey: string,
  log: FastifyBaseLogger,
  documents: SourceDocument[],
  question: string
) {
  return requestCitedAnswer(apiKey, log, {
    label: 'Ask answer',
    model: ANSWER_MODEL,
    maxTokens: ANSWER_MAX_TOKENS,
    effort: 'low',
    documents,
    prompt: `<question>\n${question}\n</question>\n\n${ANSWER_PROMPT}`,
    logFields: {
      document_count: documents.length,
      page_count: documents.reduce((sum, doc) => sum + doc.pages.length, 0)
    }
  }).catch(providerFailed)
}

/**
 * `/ask` route: answers questions across the collection. Ask is synchronous (see the README), so it calls Claude inside the request.
 *
 * TODO: require auth once the auth model is decided.
 */
const ask: FastifyPluginAsync = async (fastify) => {
  /**
   * `POST /ask`: answers `question` from the collection, citing the pages used (flow in the README).
   *
   * @throws 400 `question` is missing, empty or too long · 502 a Claude call failed
   */
  fastify.post<{ Body: { question: string } }>(
    '/ask',
    {
      schema: {
        body: {
          type: 'object',
          required: ['question'],
          properties: {
            question: {
              type: 'string',
              minLength: 1,
              maxLength: MAX_QUESTION_LENGTH
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              documents: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    document_id: { type: 'string' },
                    title: { type: 'string' },
                    document_type: { type: 'string' }
                  },
                  required: ['document_id', 'title', 'document_type']
                }
              },
              answer: { type: ['string', 'null'] },
              citations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    document_id: { type: 'string' },
                    page: { type: 'integer' }
                  },
                  required: ['document_id', 'page']
                }
              }
            },
            required: ['documents', 'answer', 'citations']
          }
        }
      }
    },
    async (request) => {
      const { question } = request.body
      const apiKey = fastify.config.ANTHROPIC_API_KEY

      // pick documents from the catalogue
      // MVP: the whole catalogue goes into every prompt, uncached. Cache it when questions get frequent; search it in Postgres if it outgrows the context.
      // MVP: only classified documents are in it; pending and failed ones are left out without notice.
      const { rows: catalogue } = await fastify.pg.query<CatalogueRow>(
        `select id, document_type, title, summary from documents
         where document_type is not null
         order by created_at`
      )
      const documents = await pickDocuments(
        apiKey,
        request.log,
        catalogue,
        question
      )
      if (documents.length === 0) {
        return { documents, answer: null, citations: [] }
      }

      // load their pages, in pick order
      // MVP: every page of every picked document goes into the prompt, uncached. Cap or rank pages if documents get long.
      const { rows: pages } = await fastify.pg.query<PageRow>(
        `select document_id, page_number, text from document_pages
         where document_id = any($1)
         order by page_number`,
        [documents.map((hit) => hit.document_id)]
      )
      const sources = documents.map((hit) => ({
        id: hit.document_id,
        title: hit.title,
        pages: pages
          .filter((row) => row.document_id === hit.document_id)
          .map((row) => ({ page: row.page_number, text: row.text }))
      }))

      // answer from the pages
      const { answer, citations } = await answerFromDocuments(
        apiKey,
        request.log,
        sources,
        question
      )
      return { documents, answer, citations }
    }
  )
}

export default ask
