import { setTimeout as sleep } from 'node:timers/promises'
import { Pool } from 'pg'
import { loadConfig } from './env'
import { runOnce } from './worker'

/** How long to wait before polling again when the queue is empty or the database is unreachable. */
const POLL_INTERVAL_MS = 2_000

async function main() {
  const config = loadConfig()
  const pool = new Pool({ connectionString: config.DATABASE_URL })
  // an idle client losing its connection (e.g. Postgres restarting) emits here; unhandled, it would crash the process
  pool.on('error', (err) =>
    console.error('Idle database client error:', err.message)
  )

  // stop polling on shutdown; aborting also cuts the current sleep short
  const shutdown = new AbortController()
  process.once('SIGINT', () => shutdown.abort())
  process.once('SIGTERM', () => shutdown.abort())

  console.log('Worker started')

  // poll: back-to-back while jobs keep coming, sleep when idle or after an error, so the loop never spins
  while (!shutdown.signal.aborted) {
    let claimed = false
    try {
      claimed = await runOnce(pool, config)
    } catch (err) {
      console.error('Polling failed:', err)
    }
    if (!claimed) {
      await sleep(POLL_INTERVAL_MS, undefined, {
        signal: shutdown.signal
      }).catch(() => {})
    }
  }

  // the in-flight job has finished by the time the loop exits
  await pool.end()
  console.log('Worker stopped')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
