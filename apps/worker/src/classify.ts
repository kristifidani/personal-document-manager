import type Anthropic from '@anthropic-ai/sdk'
import { requestJson } from './claude'

/** Sonnet at low effort, like OCR; it classified the samples correctly in a test run. */
const MODEL = 'claude-sonnet-5-5'

/** The answer is short; this leaves room for the model's thinking. */
const MAX_TOKENS = 16_000

/** The types a document can have. Keep in sync with `documents_document_type_check` in the backend's migrations. */
const DOCUMENT_TYPES = [
  'contract',
  'invoice',
  'receipt',
  'payslip',
  'bank_statement',
  'tax',
  'insurance',
  'medical',
  'identity',
  'certificate',
  'letter',
  'other'
]

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_type', 'title', 'summary'],
  properties: {
    document_type: { type: 'string', enum: DOCUMENT_TYPES },
    title: { type: 'string' },
    summary: { type: 'string' }
  }
}

const PROMPT = `Classify the personal document above. Its pages are in <page> tags. Write in English, whatever the document's language.

- document_type: the closest type; "other" when none fits.
- title: a short title that tells this document apart from similar ones, such as "Employment contract with Example Ltd".
- summary: two or three sentences on what the document is and its key facts (who it involves, important dates and amounts), so a question about it can find it later.`

/** What `classifyText` reads from a document; the `documents` columns of the same names. */
export interface Classification {
  document_type: string
  title: string
  summary: string
}

/**
 * Reads a document's text with Claude and returns its type, a title and an English summary. The `classify` handler calls it with the stored pages, one string per page.
 * @throws when the request fails (see `requestJson`).
 */
export async function classifyText(
  apiKey: string,
  pages: string[]
): Promise<Classification> {
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: pages
        .map((text, i) => `<page number="${i + 1}">\n${text}\n</page>`)
        .join('\n')
    },
    { type: 'text', text: PROMPT }
  ]
  return (await requestJson(apiKey, {
    label: 'Classification',
    model: MODEL,
    maxTokens: MAX_TOKENS,
    effort: 'low',
    schema: CLASSIFICATION_SCHEMA,
    content,
    logFields: { page_count: pages.length }
  })) as Classification
}
