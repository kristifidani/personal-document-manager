/**
 * Uploads every file in the root `samples/` folder through the running backend, for trying Ask by hand.
 *
 * Runs as `npm run samples:upload`; start the backend and the worker first. A sample that is already uploaded is skipped, so running it twice is safe.
 */
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const SAMPLES_DIR = join(__dirname, '../../../samples')

/** Content type per sample extension; other files, like the README, are skipped. */
const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.png': 'image/png'
}

async function uploadSamples() {
  const { PORT } = process.env
  if (!PORT) throw new Error('PORT must be set (see .env)')
  const baseUrl = `http://localhost:${PORT}`

  for (const name of (await readdir(SAMPLES_DIR)).sort()) {
    const mimeType = MIME_TYPES[extname(name)]
    if (!mimeType) continue

    const form = new FormData()
    const content = await readFile(join(SAMPLES_DIR, name))
    form.append('file', new Blob([content], { type: mimeType }), name)
    const res = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      body: form
    })
    const body = (await res.json()) as { id?: string; code?: string }
    const detail = String(body.id ?? body.code)
    if (res.status === 201) {
      console.log(`${name}: uploaded as ${detail}`)
    } else if (res.status === 409) {
      console.log(`${name}: already uploaded`)
    } else {
      console.log(`${name}: failed with ${String(res.status)} ${detail}`)
    }
  }
}

uploadSamples().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
