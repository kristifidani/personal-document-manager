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
    // idle clients emit here when Postgres drops them; unhandled, it would crash the process
    fastify.pg.pool.on('error', (err) =>
      fastify.log.error(err, 'Idle database client error')
    )
  },
  { name: 'postgres', dependencies: ['env'] }
)
