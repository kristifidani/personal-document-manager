import type { Pool } from 'pg'

/** A claimed `jobs` row: the columns a handler needs. */
export interface Job {
  id: string
  document_id: string
  job_type: string
}

/**
 * Claims the oldest pending job (sets it to `processing`), or returns `undefined` if none. `skip locked` makes concurrent claims skip each other's row, so each job is claimed once.
 *
 * MVP: a crashed worker's `processing` job is never reclaimed. Reclaiming needs an attempts cap, so it comes with retries.
 */
export async function claimJob(pool: Pool): Promise<Job | undefined> {
  const { rows } = await pool.query<Job>(
    `update jobs set status = 'processing'
     where id = (
       select id from jobs
       where status = 'pending'
       order by created_at
       for update skip locked
       limit 1
     )
     returning id, document_id, job_type`
  )
  return rows[0]
}

/** Records a claimed job's outcome: `failed` with `error` as the reason when one is given, `done` otherwise. */
export async function finishJob(
  pool: Pool,
  id: string,
  error?: string
): Promise<void> {
  await pool.query('update jobs set status = $2, error = $3 where id = $1', [
    id,
    error === undefined ? 'done' : 'failed',
    error ?? null
  ])
}
