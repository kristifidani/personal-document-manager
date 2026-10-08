import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join, resolve } from 'node:path'
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

/** A stored file: what the backend's upload would have saved, and its mime type. */
interface TestFile {
  content: Buffer
  mimeType: string
}

/** Inserts a document as the backend's upload does and writes `file` to `STORAGE_DIR`. With `file: null`, the stored file is missing. */
export async function createDocument(
  pool: Pool,
  config: Config,
  file: TestFile | null
) {
  // store file under the document id, like the backend's storage plugin
  const documentId = randomUUID()
  if (file) {
    const dir = resolve(config.STORAGE_DIR)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, documentId), file.content)
  }

  await pool.query(
    `insert into documents (id, filename, mime_type, size_bytes, storage_path)
     values ($1, 'test', $2, $3, $4)`,
    [
      documentId,
      file?.mimeType ?? 'application/pdf',
      file?.content.length ?? 0,
      documentId
    ]
  )
  return documentId
}

/** The repo's shared sample documents. */
const SAMPLES_DIR = join(__dirname, '../../../samples')

const SAMPLE_MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg'
}

/** A file from `samples/`, as the backend's upload would have stored it. */
export function sample(name: string): TestFile {
  const mimeType = SAMPLE_MIME_TYPES[extname(name)]
  if (!mimeType) throw new Error(`No mime type for sample ${name}`)
  return { content: readFileSync(join(SAMPLES_DIR, name)), mimeType }
}

/** Inserts a document and a pending `extract` job. The test must claim the job so the next test starts with an empty queue. */
export async function createDocumentWithJob(
  pool: Pool,
  config: Config,
  file: TestFile | null
) {
  const documentId = await createDocument(pool, config, file)
  const { rows } = await pool.query<{ id: string }>(
    `insert into jobs (document_id, job_type) values ($1, 'extract') returning id`,
    [documentId]
  )
  const job = rows[0]
  if (!job) throw new Error('Inserting the job returned no row')
  return { documentId, jobId: job.id }
}

/** Reads a document's saved pages, in page order. */
export async function readPages(pool: Pool, documentId: string) {
  const { rows } = await pool.query<{ page_number: number; text: string }>(
    'select page_number, text from document_pages where document_id = $1 order by page_number',
    [documentId]
  )
  return rows
}

/** Reads a job's current status and failure reason. */
export async function readJob(pool: Pool, jobId: string) {
  const { rows } = await pool.query<{ status: string; error: string | null }>(
    'select status, error from jobs where id = $1',
    [jobId]
  )
  return rows[0]
}
