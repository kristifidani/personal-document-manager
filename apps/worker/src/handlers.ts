import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Pool } from 'pg'
import { extractText } from 'unpdf'
import { classifyText } from './classify'
import type { Config } from './env'
import { logger } from './logger'
import { ocr } from './ocr'
import type { Job } from './queue'

/**
 * Reads a PDF's text layer locally, one string per page, and OCRs the PDF only when no page has one (a scan).
 * MVP: a mixed PDF keeps its scanned pages empty, and a scan with a text watermark on every page skips OCR.
 */
async function readPdf(apiKey: string, file: Buffer) {
  // the parser's messages can quote values from the file, so `jobs.error` gets our own message and the log keeps the parser's as `cause`
  const { text: pages } = await extractText(new Uint8Array(file)).catch(
    (err: unknown) => {
      throw new Error('Could not read the PDF text layer', { cause: err })
    }
  )
  logger().debug({ page_count: pages.length }, 'Text layer read')
  if (pages.some((text) => text.trim())) return pages
  return ocr(apiKey, file, 'application/pdf', pages.length)
}

/**
 * Saves the document's text, one `document_pages` row per page, and queues its `classify` job. Resolves the file's path like the backend's `src/plugins/storage.ts`.
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
      pages = await ocr(config.ANTHROPIC_API_KEY, file, document.mime_type, 1)
      break
    default:
      throw new Error(`Unsupported mime type: ${document.mime_type}`)
  }

  // replace the pages and queue classify in one transaction, so a re-run never duplicates pages
  // and classify is pending before this job is done: the document's status never reads `done` in between
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
    // a re-run needs classify again, unless one is still waiting: it will read these pages too
    await client.query(
      `insert into jobs (document_id, job_type)
       select $1, 'classify'
       where not exists (
         select 1 from jobs where document_id = $1 and job_type = 'classify' and status = 'pending'
       )`,
      [job.document_id]
    )
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
  logger().debug({ page_count: pages.length }, 'Pages saved')
}

/**
 * Saves what Claude reads from the document's stored pages into its classification columns.
 * MVP: replaces any earlier result, including values the user corrected; once they can edit them, edits must be kept (README).
 * @throws when the document has no text, so it is never marked classified with nothing read.
 */
async function classify(pool: Pool, config: Config, job: Job) {
  // load the pages
  const { rows } = await pool.query<{ text: string }>(
    'select text from document_pages where document_id = $1 order by page_number',
    [job.document_id]
  )
  const pages = rows.map((row) => row.text)
  if (!pages.some((text) => text.trim())) {
    throw new Error('Document has no text to classify')
  }

  // classify and save
  const result = await classifyText(config.ANTHROPIC_API_KEY, pages)
  await pool.query(
    `update documents
     set document_type = $2, title = $3, summary = $4
     where id = $1`,
    [job.document_id, result.document_type, result.title, result.summary]
  )
  logger().debug('Classification saved')
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
    case 'classify':
      return classify(pool, config, job)
    default:
      throw new Error(`Unknown job type: ${job.job_type}`)
  }
}
