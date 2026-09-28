import type { Pool } from 'pg'

/** A claimed `jobs` row: the columns a handler needs. */
export interface Job {
  id: string
  document_id: string
  job_type: string
}

/**
 * Claims the oldest pending job by moving it to `processing`, or returns `undefined` when none is pending. `for update skip locked` lets concurrent claimers skip a row another one is claiming, so each job is claimed once.
 *
 * MVP: a job left in `processing` by a crashed worker stays there; nothing reclaims it. Reclaiming needs an attempts cap so a job that crashes the worker can't loop forever, so it comes with retries (see the jobs migration).
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

/** Records a claimed job's outcome. A finished job never returns to `pending`, so each job is attempted at most once. */
export async function finishJob(
  pool: Pool,
  id: string,
  status: 'done' | 'failed'
): Promise<void> {
  await pool.query('update jobs set status = $2 where id = $1', [id, status])
}
