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
  size_bytes: number
  created_at: Date
}

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
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              filename: { type: 'string' },
              mime_type: { type: 'string' },
              size_bytes: { type: 'number' },
              created_at: { type: 'string' }
            },
            required: [
              'id',
              'filename',
              'mime_type',
              'size_bytes',
              'created_at'
            ]
          }
        }
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
             returning id, filename, mime_type, size_bytes, created_at`,
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
}

export default documents
