import { setTimeout as sleep } from 'node:timers/promises'
import type { Pool } from 'pg'
import type { Config } from './env'
import { handleJob } from './handlers'
import { claimJob, finishJob } from './queue'

/** Wait between polls when the queue is empty or the database is down. */
const POLL_INTERVAL_MS = 2_000

/**
 * Processes jobs until `signal` aborts. Aborting cuts a sleep short, but a running job finishes first.
 */
export async function pollJobs(
  pool: Pool,
  config: Config,
  signal: AbortSignal
) {
  while (!signal.aborted) {
    let claimed = false
    try {
      claimed = await runOnce(pool, config)
    } catch (err) {
      console.error('Polling failed:', err)
    }
    if (!claimed) {
      // rejects only when aborted
      await sleep(POLL_INTERVAL_MS, undefined, { signal }).catch(() => {})
    }
  }
}

/**
 * Claims one job, runs its handler and records `done` or `failed`.
 * @returns whether a job was claimed.
 * @throws when claiming or recording fails; a handler error only fails the job.
 */
export async function runOnce(pool: Pool, config: Config): Promise<boolean> {
  const job = await claimJob(pool)
  if (!job) return false

  // run the handler
  let status: 'done' | 'failed'
  try {
    await handleJob(pool, config, job)
    status = 'done'
  } catch (err) {
    // MVP: the error is only logged; `jobs` has no error column yet.
    status = 'failed'
    console.error(`Job ${job.id} (${job.job_type}) failed:`, err)
  }

  // record the outcome
  await finishJob(pool, job.id, status)
  if (status === 'done') console.log(`Job ${job.id} (${job.job_type}) done`)
  return true
}
