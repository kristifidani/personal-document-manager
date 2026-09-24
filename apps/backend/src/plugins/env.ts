import fastifyEnv from '@fastify/env'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      /** Postgres connection string. */
      DATABASE_URL: string
      /** Local directory for uploaded files; created at boot if missing. */
      STORAGE_DIR: string
    }
  }
}

const schema = {
  type: 'object',
  required: ['DATABASE_URL', 'STORAGE_DIR'],
  properties: {
    DATABASE_URL: { type: 'string', minLength: 1 },
    STORAGE_DIR: { type: 'string', minLength: 1 }
  }
}

/**
 * Validates the environment at boot and exposes it as `fastify.config`, so the app fails fast on missing config. `dotenv: true` reads `.env` directly, so tests, which build the app without fastify-cli, get the same config. `process.env` wins over `.env` when both are set.
 */
export default fp(
  async (fastify) => {
    await fastify.register(fastifyEnv, { schema, dotenv: true })
  },
  { name: 'env' }
)
