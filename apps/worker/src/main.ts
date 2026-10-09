import { Pool } from 'pg'
import { loadConfig } from './env'
import { logger } from './logger'
import { pollJobs } from './worker'

const log = logger()

async function main() {
  const config = loadConfig()
  log.level = config.LOG_LEVEL
  const pool = new Pool({ connectionString: config.DATABASE_URL })
  // idle clients emit here when Postgres drops them; unhandled, it would crash the process
  pool.on('error', (err) => log.error({ err }, 'Idle database client error'))

  // stop polling on Ctrl+C or SIGTERM
  const shutdown = new AbortController()
  process.once('SIGINT', () => shutdown.abort())
  process.once('SIGTERM', () => shutdown.abort())

  log.info('Worker started')
  await pollJobs(pool, config, shutdown.signal)
  await pool.end()
  log.info('Worker stopped')
}

main().catch((err: unknown) => {
  log.fatal({ err }, 'Worker crashed')
  process.exitCode = 1
})
