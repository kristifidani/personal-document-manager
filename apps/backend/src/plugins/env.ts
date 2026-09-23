import fastifyEnv from '@fastify/env'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      DATABASE_URL: string
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

// dotenv: true lets this plugin read .env directly, so config is validated
// the same way whether the app boots via fastify-cli (dev/start) or is
// built directly in tests (test/helper.ts). process.env still wins over
// .env when both are set.
export default fp(
  async (fastify) => {
    await fastify.register(fastifyEnv, { schema, dotenv: true })
  },
  { name: 'env' }
)
