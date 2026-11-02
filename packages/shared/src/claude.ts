/** Calls to Claude shared by the apps. Server-only: every call needs the API key, so the frontend never imports this. */
import Anthropic from '@anthropic-ai/sdk'

/** Where each call logs its cost; a pino logger or Fastify's `request.log` fits. */
interface Logger {
  info(fields: Record<string, unknown>, message: string): void
}

/** Settings every call to Claude takes. */
interface CallSettings {
  /** Names the call in logs and errors, e.g. `OCR`. */
  label: string
  model: string
  maxTokens: number
  effort: 'low' | 'medium' | 'high'
  /** Extra fields for the `<label> finished` log line. */
  logFields?: Record<string, unknown>
}

/**
 * Sends one message to Claude and returns the finished response. It streams, so a long response doesn't hit the SDK's timeout.
 * @throws when the call fails or stops early. Error messages never quote the input.
 */
async function send(
  apiKey: string,
  log: Logger,
  settings: CallSettings,
  content: Anthropic.ContentBlockParam[],
  format?: Anthropic.JSONOutputFormat
): Promise<Anthropic.Message> {
  const { label } = settings
  const start = performance.now()
  let message: Anthropic.Message
  try {
    message = await new Anthropic({ apiKey }).messages
      .stream({
        model: settings.model,
        max_tokens: settings.maxTokens,
        output_config: { effort: settings.effort, format },
        messages: [{ role: 'user', content }]
      })
      .finalMessage()
  } catch (err) {
    throw new Error(`${label} request failed`, { cause: err })
  }

  // log before checking: a response that fails the check is still billed
  log.info(
    {
      ...settings.logFields,
      duration_ms: Math.round(performance.now() - start),
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens
    },
    `${label} finished`
  )
  if (message.stop_reason !== 'end_turn') {
    throw new Error(`${label} stopped early: ${String(message.stop_reason)}`)
  }
  return message
}

/**
 * Returns Claude's response as JSON matching `schema`. Used by OCR, classify and Ask's pick step.
 * @throws when the call fails or the response isn't valid JSON.
 */
export async function requestJson(
  apiKey: string,
  log: Logger,
  request: CallSettings & {
    content: Anthropic.ContentBlockParam[]
    /** JSON schema the response must match. */
    schema: Record<string, unknown>
  }
): Promise<unknown> {
  const message = await send(apiKey, log, request, request.content, {
    type: 'json_schema',
    schema: request.schema
  })
  const text = message.content.find((block) => block.type === 'text')?.text
  if (text === undefined) {
    throw new Error(`${request.label} returned no text block`)
  }
  // no `cause`: the parse error quotes document text
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${request.label} returned invalid JSON`)
  }
}

/** A document to answer from, with its text per page. */
export interface SourceDocument {
  id: string
  title: string
  pages: { page: number; text: string }[]
}

/** An answer and the pages it cites. */
interface CitedAnswer {
  answer: string
  citations: { document_id: string; page: number }[]
}

/**
 * Answers from `documents` and returns the pages Claude cites. Used by Ask.
 *
 * Claude's citations only point at text it was sent, so a cited page always exists. Input and output are plain data: another provider would only change this function.
 * @throws when the call fails or stops early.
 */
export async function requestCitedAnswer(
  apiKey: string,
  log: Logger,
  request: CallSettings & {
    documents: SourceDocument[]
    /** Text after the documents: the question and how to answer it. */
    prompt: string
  }
): Promise<CitedAnswer> {
  // send one block per page; Claude rejects empty blocks, so leave empty pages out
  const sent = request.documents
    .map((document) => ({
      document,
      pages: document.pages.filter((page) => page.text.trim())
    }))
    .filter(({ pages }) => pages.length > 0)
  const message = await send(apiKey, log, request, [
    ...sent.map(({ document, pages }): Anthropic.DocumentBlockParam => ({
      type: 'document',
      title: document.title,
      source: {
        type: 'content',
        content: pages.map((page) => ({ type: 'text', text: page.text }))
      },
      citations: { enabled: true }
    })),
    { type: 'text', text: request.prompt }
  ])

  // map each cited block back to its document and page, once each
  // MVP: one citation list for the whole answer; tie them to sentences once a client shows them inline
  const textBlocks = message.content.filter((block) => block.type === 'text')
  const citations = new Map<string, CitedAnswer['citations'][number]>()
  for (const citation of textBlocks.flatMap((block) => block.citations ?? [])) {
    if (citation.type !== 'content_block_location') continue
    const cited = sent[citation.document_index]
    if (!cited) continue
    const pages = cited.pages.slice(
      citation.start_block_index,
      citation.end_block_index // exclusive
    )
    for (const { page } of pages) {
      const document_id = cited.document.id
      citations.set(`${document_id}:${String(page)}`, { document_id, page })
    }
  }

  // Claude splits the answer where its citations change
  return {
    answer: textBlocks.map((block) => block.text).join(''),
    citations: [...citations.values()]
  }
}
