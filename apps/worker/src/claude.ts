import Anthropic from '@anthropic-ai/sdk'
import { logger } from './logger'

/** One structured request to Claude: what `requestJson` sends. */
interface JsonRequest {
  /** Names the step in errors and logs, e.g. `OCR`. */
  label: string
  model: string
  maxTokens: number
  effort: 'low' | 'medium' | 'high'
  /** JSON schema the response must match. */
  schema: Record<string, unknown>
  content: Anthropic.ContentBlockParam[]
  /** Extra fields for the `<label> finished` log line. */
  logFields?: Record<string, unknown>
}

/**
 * Sends one message to Claude and returns its JSON response, unchecked beyond the schema. `ocr` and `classifyText` call it.
 * Streaming keeps a long response clear of the SDK's HTTP timeout.
 * @throws when the request fails, Claude stops early or returns no valid JSON. Messages start with `label` and never quote the document.
 */
export async function requestJson(
  apiKey: string,
  request: JsonRequest
): Promise<unknown> {
  const { label } = request
  const start = performance.now()
  let message: Anthropic.Message
  try {
    message = await new Anthropic({ apiKey }).messages
      .stream({
        model: request.model,
        max_tokens: request.maxTokens,
        output_config: {
          effort: request.effort,
          format: { type: 'json_schema', schema: request.schema }
        },
        messages: [{ role: 'user', content: request.content }]
      })
      .finalMessage()
  } catch (err) {
    throw new Error(`${label} request failed`, { cause: err })
  }
  // log the cost first: a response that fails the checks below is still billed
  logger().info(
    {
      ...request.logFields,
      duration_ms: Math.round(performance.now() - start),
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens
    },
    `${label} finished`
  )

  // only a finished response is guaranteed to match the schema
  if (message.stop_reason !== 'end_turn') {
    throw new Error(`${label} stopped early: ${String(message.stop_reason)}`)
  }
  const text = message.content.find((block) => block.type === 'text')?.text
  if (text === undefined) throw new Error(`${label} returned no text block`)
  // no `cause`: the parse error quotes document text, and `runOnce` logs causes
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} returned invalid JSON`)
  }
}
