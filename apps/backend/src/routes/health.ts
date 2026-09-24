import { FastifyPluginAsync } from 'fastify'

/** `GET /health`: liveness check for deployments and monitoring. Returns `{ status: 'ok' }` while the process is serving; it does not check the database. */
const health: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: { status: { type: 'string' } },
            required: ['status']
          }
        }
      }
    },
    async () => ({ status: 'ok' })
  )
}

export default health
