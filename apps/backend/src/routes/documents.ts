import { randomUUID } from 'node:crypto'
import { FastifyPluginAsync } from 'fastify'

/** MVP: PDFs and common image formats only; extend when document processing supports more. */
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png'
])

/** Creates an error that Fastify's default handler sends with `statusCode`. */
function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}

/** `documents` columns returned to the client. */
interface DocumentRow {
  id: string
  filename: string
  mime_type: string
  // pg returns `bigint` as a string to avoid precision loss; the response schema serializes it as a number
  size_bytes: string
  created_at: Date
}

/** SQL column list matching `DocumentRow`, shared by every query that returns documents. */
const DOCUMENT_COLUMNS = 'id, filename, mime_type, size_bytes, created_at'

/** JSON response schema for one `DocumentRow`. */
const documentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    filename: { type: 'string' },
    mime_type: { type: 'string' },
    size_bytes: { type: 'number' },
    created_at: { type: 'string' }
  },
  required: ['id', 'filename', 'mime_type', 'size_bytes', 'created_at']
} as const

/**
 * `/documents` routes.
 *
 * TODO: require auth once the auth model is decided.
 */
const documents: FastifyPluginAsync = async (fastify) => {
  /**
   * `POST /documents`: uploads one file as multipart/form-data. Saves it to storage, then inserts the document and a pending `extract` job in one transaction. On any failure the stored file is removed.
   *
   * @throws 400 no file provided · 413 file too large or more than one file · 415 unsupported mime type
   */
  fastify.post(
    '/documents',
    {
      schema: {
        response: { 201: documentSchema }
      }
    },
    async (request, reply) => {
      // read the first file part; the iterator must be consumed only once
      const parts = request.files()
      const first = await parts.next()
      if (first.done) throw httpError(400, 'No file provided')
      const file = first.value

      // validate type; drain the rejected stream so the request can finish
      if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
        file.file.resume()
        throw httpError(415, `Unsupported mime type: ${file.mimetype}`)
      }

      const id = randomUUID()

      try {
        // store file
        const { path, sizeBytes } = await fastify.storage.save(id, file.file)

        // enforce limits: size, then a second part, which the parser rejects with a 413
        if (file.file.truncated) {
          throw httpError(413, 'File exceeds maximum allowed size')
        }
        await parts.next()

        // persist document and job atomically
        const document = await fastify.pg.transact(async (client) => {
          const { rows } = await client.query<DocumentRow>(
            `insert into documents (id, filename, mime_type, size_bytes, storage_path)
             values ($1, $2, $3, $4, $5)
             returning ${DOCUMENT_COLUMNS}`,
            [id, file.filename, file.mimetype, sizeBytes, path]
          )
          await client.query(
            'insert into jobs (document_id, job_type) values ($1, $2)',
            [id, 'extract']
          )
          return rows[0]
        })
        return reply.code(201).send(document)
      } catch (err) {
        // clean up: `id` is the on-disk name, so this covers every failure
        await fastify.storage.remove(id)
        throw err
      }
    }
  )

  /**
   * `GET /documents`: lists all documents, newest first.
   *
   * MVP: no pagination; a single user's collection is small. Add it when listing gets slow or the frontend needs it.
   */
  fastify.get(
    '/documents',
    {
      schema: {
        response: { 200: { type: 'array', items: documentSchema } }
      }
    },
    async () => {
      const { rows } = await fastify.pg.query<DocumentRow>(
        `select ${DOCUMENT_COLUMNS} from documents order by created_at desc`
      )
      return rows
    }
  )

  /**
   * `GET /documents/:id`: returns one document's metadata.
   *
   * @throws 400 `id` is not a UUID · 404 no document with that id
   */
  fastify.get<{ Params: { id: string } }>(
    '/documents/:id',
    {
      schema: {
        // reject malformed ids before they reach Postgres, which would fail the uuid cast with a 500
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id']
        },
        response: { 200: documentSchema }
      }
    },
    async (request) => {
      const { rows } = await fastify.pg.query<DocumentRow>(
        `select ${DOCUMENT_COLUMNS} from documents where id = $1`,
        [request.params.id]
      )
      if (rows.length === 0) throw httpError(404, 'Document not found')
      return rows[0]
    }
  )
}

export default documents
