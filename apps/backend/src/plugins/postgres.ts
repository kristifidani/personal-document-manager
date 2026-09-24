import fastifyPostgres from '@fastify/postgres'
import fp from 'fastify-plugin'

/**
 * Postgres connection pool, exposed as `fastify.pg` (`query`, `connect`, `transact`). It also holds the `jobs` queue. The pool connects lazily, so boot succeeds with the database down and queries fail instead.
 */
export default fp(
  async (fastify) => {
    await fastify.register(fastifyPostgres, {
      connectionString: fastify.config.DATABASE_URL
    })
  },
  { name: 'postgres', dependencies: ['env'] }
)
