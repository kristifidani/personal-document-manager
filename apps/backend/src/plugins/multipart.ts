import fastifyMultipart from '@fastify/multipart'
import fp from 'fastify-plugin'

/** Overall cap, the largest per-type limit in `src/routes/documents.ts`; the parser stops reading a file past it. MVP: hardcoded for the only upload route. */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Multipart/form-data parsing for file uploads (`POST /documents`). A file over the size limit is truncated and flagged, and a second file part is rejected with a 413.
 *
 * MVP: one file per request; raise `files` if bulk upload is added.
 */
export default fp(
  async (fastify) => {
    await fastify.register(fastifyMultipart, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 }
    })
  },
  { name: 'multipart' }
)
