import type { Pool } from 'pg'
import type { Config } from './env'
import { handleJob } from './handlers'
import { claimJob, finishJob } from './queue'

/**
 * Processes at most one job: claims it, runs its handler, and records `done` or `failed`. `main.ts` calls it in a loop.
 * @returns whether a job was claimed, so the caller knows to sleep when the queue is empty.
 * @throws when claiming or recording the outcome fails. Any handler error, including a failed query inside it, only fails the job.
 */
export async function runOnce(pool: Pool, config: Config): Promise<boolean> {
  const job = await claimJob(pool)
  if (!job) return false

  // run the handler; only its errors fail the job
  let status: 'done' | 'failed'
  try {
    await handleJob(pool, config, job)
    status = 'done'
    console.log(`Job ${job.id} (${job.job_type}) done`)
  } catch (err) {
    // MVP: the error is only logged, since `jobs` has no error column yet.
    status = 'failed'
    console.error(`Job ${job.id} (${job.job_type}) failed:`, err)
  }

  // record the outcome
  await finishJob(pool, job.id, status)
  return true
}
