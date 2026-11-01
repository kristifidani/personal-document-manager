import createError from '@fastify/error'
import { FastifyPluginAsync } from 'fastify'
import { requestJson } from 'shared/claude'

/** Sonnet at low effort, like the worker's classify; it picked the right samples in a test run. */
const MODEL = 'claude-sonnet-5-5'

/** The answer is a short list of ids; this leaves room for the model's thinking. */
const MAX_TOKENS = 16_000

/** Long enough for any real question, short enough to keep the request small. */
const MAX_QUESTION_LENGTH = 1000

/** The response must be the ids of the picked documents. */
const PICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_ids'],
  properties: {
    document_ids: { type: 'array', items: { type: 'string' } }
  }
}

const PROMPT = `Above is a catalogue of a person's documents, each in a <document> tag with its id and type, then its title on the first line and an English summary, followed by their question in a <question> tag.

Return the ids of the documents needed to answer the question, most relevant first. Return an empty list when none is relevant.`

/** Errors this route throws on purpose; `src/plugins/error-handler.ts` sends them to the client. */
const AskFailedError = createError(
  'ASK_FAILED',
  'Could not answer the question, try again later',
  502
)

/** A classified document as the catalogue holds it; its classification columns are all set. */
interface CatalogueRow {
  id: string
  document_type: string
  title: string
  summary: string
}

/** One picked document in the response. */
interface AskHit {
  document_id: string
  title: string
  document_type: string
}

/**
 * `/ask` route: answers questions across the collection. Ask is synchronous (see the README), so it calls Claude inside the request.
 *
 * TODO: require auth once the auth model is decided.
 */
const ask: FastifyPluginAsync = async (fastify) => {
  /**
   * `POST /ask`: picks the documents that answer `question`. Claude reads the catalogue (each classified document's type, title and summary) and returns their ids, most relevant first.
   *
   * @throws 400 `question` is missing, empty or too long · 502 the Claude request failed
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
              }
            },
            required: ['documents']
          }
        }
      }
    },
    async (request) => {
      // load the catalogue
      // MVP: the whole catalogue goes into every prompt, uncached. Cache it when questions get frequent; search it in Postgres if it outgrows the context.
      // MVP: only classified documents are in it; pending and failed ones are left out without notice.
      const { rows } = await fastify.pg.query<CatalogueRow>(
        `select id, document_type, title, summary from documents
         where document_type is not null
         order by created_at`
      )
      // nothing to pick from; Claude also rejects an empty catalogue block
      if (rows.length === 0) return { documents: [] }

      // ask Claude to pick documents
      const catalogue = rows
        .map(
          (row) =>
            `<document id="${row.id}" type="${row.document_type}">\n${row.title}\n${row.summary}\n</document>`
        )
        .join('\n')
      let picked: { document_ids: string[] }
      try {
        picked = (await requestJson(
          fastify.config.ANTHROPIC_API_KEY,
          request.log,
          {
            label: 'Ask retrieval',
            model: MODEL,
            maxTokens: MAX_TOKENS,
            effort: 'low',
            schema: PICK_SCHEMA,
            content: [
              { type: 'text', text: catalogue },
              {
                type: 'text',
                text: `<question>\n${request.body.question}\n</question>`
              },
              { type: 'text', text: PROMPT }
            ],
            logFields: { catalogue_size: rows.length }
          }
        )) as { document_ids: string[] }
      } catch (err) {
        throw new AskFailedError({ cause: err })
      }

      // keep only catalogue ids, once each, so a made-up id never reaches the client
      const byId = new Map(rows.map((row) => [row.id, row]))
      const documents: AskHit[] = []
      for (const id of new Set(picked.document_ids)) {
        const row = byId.get(id)
        if (row) {
          documents.push({
            document_id: row.id,
            title: row.title,
            document_type: row.document_type
          })
        }
      }
      return { documents }
    }
  )
}

export default ask
