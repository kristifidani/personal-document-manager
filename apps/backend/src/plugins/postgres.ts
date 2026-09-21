import fastifyPostgres from '@fastify/postgres'
import fp from 'fastify-plugin'

// Decorates fastify.pg (pool, query, connect, transact). The pool connects
// lazily, so registration succeeds even if the database is unreachable;
// queries fail at call time instead.
export default fp(
  async (fastify) => {
    await fastify.register(fastifyPostgres, {
      connectionString: fastify.config.DATABASE_URL
    })
  },
  { name: 'postgres', dependencies: ['env'] }
)
