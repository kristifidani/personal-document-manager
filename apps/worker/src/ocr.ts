import Anthropic from '@anthropic-ai/sdk'
import { logger } from './logger'

/** Sonnet rather than Haiku 4.5, which misread words in a German scan. */
const MODEL = 'claude-sonnet-5-5'

/** Room for roughly 50 dense pages; streaming keeps a long response clear of the SDK's HTTP timeout. */
const MAX_TOKENS = 64_000

const PAGES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pages'],
  properties: { pages: { type: 'array', items: { type: 'string' } } }
}

const PROMPT =
  'Transcribe the text of every page exactly as written, in its original language. Return one string per page, in page order; a page without text is an empty string.'

/** The file types `ocr` reads: the backend's accepted uploads. */
type OcrMimeType = 'application/pdf' | 'image/jpeg' | 'image/png'

/**
 * Transcribes a scanned PDF or a photo with Claude, one string per page; `pageCount` is how many the file has (1 for an image). `extract` calls it for files without a text layer.
 * @throws when the request fails, Claude stops early or returns the wrong page count. Messages never quote the document.
 */
export async function ocr(
  apiKey: string,
  file: Buffer,
  mimeType: OcrMimeType,
  pageCount: number
): Promise<string[]> {
  const log = logger()
  log.debug({ mime_type: mimeType, size_bytes: file.length }, 'OCR started')

  // the file goes before the instructions, as the vision docs recommend
  const data = file.toString('base64')
  const source: Anthropic.ContentBlockParam =
    mimeType === 'application/pdf'
      ? {
          type: 'document',
          source: { type: 'base64', media_type: mimeType, data }
        }
      : {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data }
        }

  // MVP: Claude ignores EXIF rotation, so a sideways phone photo reads worse; rotate it in the frontend before upload
  const start = performance.now()
  let message: Anthropic.Message
  try {
    message = await new Anthropic({ apiKey }).messages
      .stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // transcription needs no reasoning; low read a test scan as well as high
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: PAGES_SCHEMA }
        },
        messages: [
          { role: 'user', content: [source, { type: 'text', text: PROMPT }] }
        ]
      })
      .finalMessage()
  } catch (err) {
    throw new Error('OCR request failed', { cause: err })
  }
  // log the cost first: a response that fails the checks below is still billed
  log.info(
    {
      page_count: pageCount,
      duration_ms: Math.round(performance.now() - start),
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens
    },
    'OCR finished'
  )

  // only a finished response is guaranteed to match the schema
  if (message.stop_reason !== 'end_turn') {
    throw new Error(`OCR stopped early: ${String(message.stop_reason)}`)
  }
  const text = message.content.find((block) => block.type === 'text')?.text
  if (text === undefined) throw new Error('OCR returned no text block')
  // no `cause`: the parse error quotes document text, and `runOnce` logs causes
  let pages: string[]
  try {
    pages = (JSON.parse(text) as { pages: string[] }).pages
  } catch {
    throw new Error('OCR returned invalid JSON')
  }

  // the schema can't fix the length, so check it
  if (pages.length !== pageCount) {
    throw new Error(`OCR returned ${pages.length} pages, expected ${pageCount}`)
  }
  return pages
}
