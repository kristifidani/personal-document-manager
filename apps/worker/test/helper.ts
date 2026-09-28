import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import type { TestContext } from 'node:test'
import { Pool } from 'pg'
import { type Config, loadConfig } from '../src/env'

/** Loads the config and opens a pool to the test database, closed when the test ends. */
export function connect(t: TestContext) {
  const config = loadConfig()
  const pool = new Pool({ connectionString: config.DATABASE_URL })
  t.after(() => pool.end())
  return { pool, config }
}

/** Inserts a document as the backend's upload does. With `withFile`, also writes its file to `STORAGE_DIR`. */
export async function createDocument(
  pool: Pool,
  config: Config,
  { withFile }: { withFile: boolean }
) {
  // store file under the document id, like the backend's storage plugin
  const documentId = randomUUID()
  if (withFile) {
    const dir = resolve(config.STORAGE_DIR)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, documentId), 'test file')
  }

  await pool.query(
    `insert into documents (id, filename, mime_type, size_bytes, storage_path)
     values ($1, 'test.pdf', 'application/pdf', 9, $2)`,
    [documentId, documentId]
  )
  return documentId
}

/** Inserts a document (see `createDocument`) and a pending `extract` job for it. The test must claim the job, so later tests start from an empty queue. */
export async function createDocumentWithJob(
  pool: Pool,
  config: Config,
  options: { withFile: boolean }
) {
  const documentId = await createDocument(pool, config, options)
  const { rows } = await pool.query<{ id: string }>(
    `insert into jobs (document_id, job_type) values ($1, 'extract') returning id`,
    [documentId]
  )
  return { documentId, jobId: rows[0].id }
}

/** Reads a job's current status. */
export async function jobStatus(pool: Pool, jobId: string) {
  const { rows } = await pool.query<{ status: string }>(
    'select status from jobs where id = $1',
    [jobId]
  )
  return rows[0]?.status
}
