import { randomUUID } from 'node:crypto'
import { FastifyPluginAsync } from 'fastify'

// Matches the README's MVP scope: PDFs and images.
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png'
])

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}

interface DocumentRow {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: Date
}

const documents: FastifyPluginAsync = async (fastify) => {
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
      // A single call to request.files() re-pipes the raw request into a
      // fresh busboy parser, so it must be called exactly once and iterated
      // to completion on the same generator — calling request.file()/files()
      // again would try to re-consume an already-draining stream.
      const parts = request.files()
      const first = await parts.next()
      if (first.done) throw httpError(400, 'No file provided')
      const file = first.value

      if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
        // @fastify/multipart needs every file stream consumed to finish
        // parsing the request; drain it before rejecting so we don't leave
        // the parser (and the underlying connection) hanging.
        file.file.resume()
        throw httpError(415, `Unsupported mime type: ${file.mimetype}`)
      }

      const id = randomUUID()

      // A single cleanup path: `id` is always the on-disk filename (see
      // storage.ts), so it's safe to remove regardless of how far this got
      // before failing — a save() error leaving a partial file, a truncated
      // upload, a second file part, or a failed DB transaction all land here.
      try {
        const { path, sizeBytes } = await fastify.storage.save(id, file.file)

        if (file.file.truncated) {
          throw httpError(413, 'File exceeds maximum allowed size')
        }

        // Keep draining the same iterator: with the multipart plugin's
        // `files: 1` limit, a second file part surfaces here as a rejected
        // FilesLimitError instead of being silently dropped after we've
        // already committed the first one.
        const second = await parts.next()
        if (!second.done) {
          throw httpError(400, 'Only one file may be uploaded per request')
        }

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
        await fastify.storage.remove(id)
        throw err
      }
    }
  )
}

export default documents
