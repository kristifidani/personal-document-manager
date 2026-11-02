import fastifyMultipart from '@fastify/multipart'
import fp from 'fastify-plugin'

/**
 * Multipart/form-data parsing for file uploads. Each upload route sets its own limits when it reads the parts (see `POST /documents`); without them the parser caps a file at Fastify's body limit.
 */
export default fp(
  async (fastify) => {
    await fastify.register(fastifyMultipart)
  },
  { name: 'multipart' }
)
