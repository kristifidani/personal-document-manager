import Anthropic from '@anthropic-ai/sdk'

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
 * Transcribes a scanned PDF or a photo with Claude, one string per page (an image is one page). `extract` calls it for files without a text layer.
 * @throws when the request fails or Claude stops before finishing. Messages never quote the document; the SDK's error is the `cause`.
 */
export async function ocr(
  apiKey: string,
  file: Buffer,
  mimeType: OcrMimeType
): Promise<string[]> {
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

  // MVP: Claude ignores image metadata, so a phone photo stored sideways with an EXIF rotation arrives sideways, and the vision docs warn accuracy drops; rotate it before upload once there is a frontend
  let message: Anthropic.Message
  try {
    message = await new Anthropic({ apiKey }).messages
      .stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // transcription needs no reasoning: low and high effort read the same scan identically
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

  // only a finished response is guaranteed to match the schema
  if (message.stop_reason !== 'end_turn') {
    throw new Error(`OCR stopped early: ${String(message.stop_reason)}`)
  }
  const text = message.content.find((block) => block.type === 'text')?.text
  if (text === undefined) throw new Error('OCR returned no text block')
  // a parse error's message quotes the input, which is document text
  try {
    return (JSON.parse(text) as { pages: string[] }).pages
  } catch (err) {
    throw new Error('OCR returned invalid JSON', { cause: err })
  }
}
