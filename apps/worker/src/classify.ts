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
  required: [
    'document_type',
    'title',
    'language',
    'parties',
    'dates',
    'summary'
  ],
  properties: {
    document_type: { type: 'string', enum: DOCUMENT_TYPES },
    title: { type: 'string' },
    language: { type: 'string' },
    parties: { type: 'array', items: { type: 'string' } },
    dates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'label'],
        properties: {
          date: { type: 'string', format: 'date' },
          label: { type: 'string' }
        }
      }
    },
    summary: { type: 'string' }
  }
}

const PROMPT = `Classify the personal document above. Its pages are in <page> tags. Write every value in English, whatever the document's language.

- document_type: the closest type; "other" when none fits.
- title: a short title that tells this document apart from similar ones, such as "Employment contract with Example Ltd".
- language: the ISO 639-1 code of the document's main language, such as "en" or "de".
- parties: the full names of the people and organisations the document is about or between. Leave out names that only appear in passing.
- dates: each date that matters to the document, such as a start, due, issue or expiry date, with a short label saying what it is.
- summary: two or three sentences on what the document is and its key facts, so it can be found later by a question about it.`

/** What `classifyText` reads from a document; the `documents` columns of the same names. */
export interface Classification {
  document_type: string
  title: string
  language: string
  parties: string[]
  dates: { date: string; label: string }[]
  summary: string
}

/**
 * Reads a document's text with Claude and returns its type, title, language, parties, dates and an English summary. The `classify` handler calls it with the stored pages, one string per page.
 * @throws when the request fails (see `requestJson`) or returns a language that is not a two-letter code.
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
  const classification = (await requestJson(apiKey, {
    label: 'Classification',
    model: MODEL,
    maxTokens: MAX_TOKENS,
    effort: 'low',
    schema: CLASSIFICATION_SCHEMA,
    content,
    logFields: { page_count: pages.length }
  })) as Classification

  // the schema can't express the code's shape; the column's check would reject it with the whole row in the error
  if (!/^[a-z]{2}$/.test(classification.language)) {
    throw new Error('Classification returned an invalid language code')
  }
  return classification
}
