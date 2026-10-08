import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Pool } from 'pg'
import { extractText } from 'unpdf'
import type { Config } from './env'
import { ocr } from './ocr'
import type { Job } from './queue'

/**
 * Reads a PDF's text layer locally, one string per page, and sends the PDF to OCR only when no page has one (a scan).
 * MVP: a mixed PDF keeps the empty pages of its scanned parts, and a scan whose app stamped a text watermark on every page isn't OCRed; revisit if real documents need it.
 */
async function readPdf(apiKey: string, file: Buffer) {
  // the parser's messages can quote values from the file, so `jobs.error` gets our own message and the log keeps the parser's as `cause`
  const { text: pages } = await extractText(new Uint8Array(file)).catch(
    (err: unknown) => {
      throw new Error('Could not read the PDF text layer', { cause: err })
    }
  )
  if (pages.some((text) => text.trim())) return pages

  const scanned = await ocr(apiKey, file, 'application/pdf')
  if (scanned.length !== pages.length) {
    throw new Error(
      `OCR returned ${scanned.length} pages, expected ${pages.length}`
    )
  }
  return scanned
}

/**
 * Saves the document's text, one `document_pages` row per page. Resolves the file's path like the backend's `src/plugins/storage.ts`.
 * PDFs go through `readPdf`, images straight to OCR.
 */
async function extract(pool: Pool, config: Config, job: Job) {
  // load the document
  const { rows } = await pool.query<{
    storage_path: string
    mime_type: string
  }>('select storage_path, mime_type from documents where id = $1', [
    job.document_id
  ])
  const document = rows[0]
  if (!document) throw new Error(`Document ${job.document_id} not found`)
  const file = await readFile(
    join(resolve(config.STORAGE_DIR), document.storage_path)
  )

  // read the text, one string per page
  let pages: string[]
  switch (document.mime_type) {
    case 'application/pdf':
      pages = await readPdf(config.ANTHROPIC_API_KEY, file)
      break
    case 'image/jpeg':
    case 'image/png':
      pages = await ocr(config.ANTHROPIC_API_KEY, file, document.mime_type)
      break
    default:
      throw new Error(`Unsupported mime type: ${document.mime_type}`)
  }

  // replace the pages in one transaction, so a re-run never duplicates them
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from document_pages where document_id = $1', [
      job.document_id
    ])
    for (const [index, text] of pages.entries()) {
      await client.query(
        'insert into document_pages (document_id, page_number, text) values ($1, $2, $3)',
        [job.document_id, index + 1, text]
      )
    }
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
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
