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

/**
 * Builds a minimal valid PDF with one line of text per page, so tests need no fixture files.
 * Each text must not contain `(`, `)` or `\\`, which PDF strings would need escaped.
 */
export function pdf(pages: string[]): Buffer {
  // objects: 1 catalog, 2 page tree, then a page and its content per page, then the font
  const font = 3 + pages.length * 2
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`
  ]
  for (const [i, text] of pages.entries()) {
    const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    )
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  // body, then the cross-reference table of each object's byte offset
  let out = '%PDF-1.4\n'
  const offsets = objects.map((body, i) => {
    const offset = out.length
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
    return offset
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets
    .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
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

/** A one-page PDF, for tests that only need a file the worker can process. */
export const SAMPLE_PDF: TestFile = {
  content: pdf(['Sample page']),
  mimeType: 'application/pdf'
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
