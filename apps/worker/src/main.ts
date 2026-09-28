import { Pool } from 'pg'
import { loadConfig } from './env'
import { pollJobs } from './worker'

async function main() {
  const config = loadConfig()
  const pool = new Pool({ connectionString: config.DATABASE_URL })
  // idle clients emit here when Postgres drops them; unhandled, it would crash the process
  pool.on('error', (err) =>
    console.error('Idle database client error:', err.message)
  )

  // stop polling on Ctrl+C or SIGTERM
  const shutdown = new AbortController()
  process.once('SIGINT', () => shutdown.abort())
  process.once('SIGTERM', () => shutdown.abort())

  console.log('Worker started')
  await pollJobs(pool, config, shutdown.signal)
  await pool.end()
  console.log('Worker stopped')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
