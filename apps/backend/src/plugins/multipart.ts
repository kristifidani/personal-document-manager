import fastifyMultipart from '@fastify/multipart'
import fp from 'fastify-plugin'

/** MVP: one hardcoded limit for the only upload route; make it per-route or configurable when uploads diversify. */
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

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
