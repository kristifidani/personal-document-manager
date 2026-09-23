import fastifyMultipart from '@fastify/multipart'
import fp from 'fastify-plugin'

// Hardcoded for the single MVP upload route; revisit if a second
// upload path ever needs a different limit.
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

export default fp(
  async (fastify) => {
    await fastify.register(fastifyMultipart, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 }
    })
  },
  { name: 'multipart' }
)
