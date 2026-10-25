import Anthropic from '@anthropic-ai/sdk'
import { requestJson } from 'shared/claude'
import { logger } from './logger'

/** Sonnet rather than Haiku 4.5, which misread words in a German scan. */
const MODEL = 'claude-sonnet-5-5'

/** Room for roughly 50 dense pages. */
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
 * @throws when the request fails (see `requestJson`) or returns the wrong page count.
 */
export async function ocr(
  apiKey: string,
  file: Buffer,
  mimeType: OcrMimeType,
  pageCount: number
): Promise<string[]> {
  logger().debug(
    { mime_type: mimeType, size_bytes: file.length },
    'OCR started'
  )

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
  const { pages } = (await requestJson(apiKey, logger(), {
    label: 'OCR',
    model: MODEL,
    maxTokens: MAX_TOKENS,
    // transcription needs no reasoning; low read a test scan as well as high
    effort: 'low',
    schema: PAGES_SCHEMA,
    content: [source, { type: 'text', text: PROMPT }],
    logFields: { page_count: pageCount }
  })) as { pages: string[] }

  // the schema can't fix the length, so check it
  if (pages.length !== pageCount) {
    throw new Error(`OCR returned ${pages.length} pages, expected ${pageCount}`)
  }
  return pages
}
