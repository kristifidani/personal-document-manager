import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Pool } from 'pg'
import type { Config } from './env'
import type { Job } from './queue'

/** Checks that the document's file exists, resolving its path like the backend's `src/plugins/storage.ts`. */
async function extract(pool: Pool, config: Config, job: Job) {
  const { rows } = await pool.query<{ storage_path: string }>(
    'select storage_path from documents where id = $1',
    [job.document_id]
  )
  const document = rows[0]
  if (!document) throw new Error(`Document ${job.document_id} not found`)

  await access(join(resolve(config.STORAGE_DIR), document.storage_path))

  // TODO: extract the document's text.
}

/**
 * Runs the handler for `job.job_type`; called by `runOnce`.
 * @throws when the type is unknown or the handler fails.
 */
export async function handleJob(
  pool: Pool,
  config: Config,
  job: Job
): Promise<void> {
  switch (job.job_type) {
    case 'extract':
      return extract(pool, config, job)
    default:
      throw new Error(`Unknown job type: ${job.job_type}`)
  }
}
