import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import type { TestContext } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'
import { Pool } from 'pg'
import { type Config, loadConfig } from '../src/env'

/** Loads the config and opens a pool to the test database, closed when the test ends. */
export function connect(t: TestContext) {
  const config = loadConfig()
  const pool = new Pool({ connectionString: config.DATABASE_URL })
  t.after(() => pool.end())
  return { pool, config }
}

/** A grayscale image, one byte per pixel (0 is black, 255 white), row by row. */
interface Bitmap {
  width: number
  height: number
  pixels: Buffer
}

/** 5×7 glyphs for the characters `scan` can draw; `#` is ink. */
const GLYPHS: Record<string, string[]> = {
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....']
}

/** Text that only exists as pixels, like a scan: no text layer for the worker to read, so only OCR finds it. */
export const SCANNED_TEXT = 'HELLO WORLD'

/** Draws `text` as black glyphs on white, large enough to read reliably. */
export function scan(text: string): Bitmap {
  const scale = 8
  const margin = 16
  const width = margin * 2 + text.length * 6 * scale
  const height = margin * 2 + 7 * scale
  const pixels = Buffer.alloc(width * height, 255)
  for (let i = 0; i < text.length; i++) {
    const glyph = GLYPHS[text.charAt(i)]
    if (!glyph) throw new Error(`No glyph for ${text.charAt(i)}`)
    for (const [row, line] of glyph.entries()) {
      for (let col = 0; col < line.length; col++) {
        if (line.charAt(col) !== '#') continue
        // fill the glyph cell's scale × scale block, one pixel row at a time
        const x = margin + (i * 6 + col) * scale
        for (let y = 0; y < scale; y++) {
          const start = (margin + row * scale + y) * width + x
          pixels.fill(0, start, start + scale)
        }
      }
    }
  }
  return { width, height, pixels }
}

/** Encodes a bitmap as an 8-bit grayscale PNG. */
export function png({ width, height, pixels }: Bitmap): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, checksum])
  }
  // width, height, bit depth 8, color type 0 (grayscale); compression, filter and interlace stay 0
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  // each row starts with its filter type, 0 (none)
  const rows = Buffer.concat(
    Array.from({ length: height }, (_, y) =>
      Buffer.concat([
        Buffer.from([0]),
        pixels.subarray(y * width, (y + 1) * width)
      ])
    )
  )
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * Builds a minimal valid PDF, so tests need no fixture files. A string page is one line in the text layer; a bitmap page is only an image, like a scan.
 * Each text must not contain `(`, `)` or `\\`, which PDF strings would need escaped.
 */
export function pdf(pages: (string | Bitmap)[]): Buffer {
  // objects: 1 catalog, 2 page tree (filled in last), 3 font, then each page's objects; `add` returns the new object's number
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  const add = (body: string) => objects.push(body)
  const stream = (dict: string, data: string) =>
    `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`
  const kids = pages.map((page) => {
    if (typeof page === 'string') {
      const content = add(stream('', `BT /F1 12 Tf 72 720 Td (${page}) Tj ET`))
      return add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`
      )
    }
    // a page the size of the image, which fills it
    const { width, height } = page
    const image = add(
      stream(
        `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,
        deflateSync(page.pixels).toString('latin1')
      )
    )
    const content = add(stream('', `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q`))
    return add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im1 ${image} 0 R >> >> /Contents ${content} 0 R >>`
    )
  })
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`

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
