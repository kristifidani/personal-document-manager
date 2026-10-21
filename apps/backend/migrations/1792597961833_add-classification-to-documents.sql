-- Up Migration
-- What the worker's classify job reads from each document's text; it feeds the Ask catalogue. All null until the document is classified.

-- MVP: re-classifying overwrites these columns; once the user can edit them, edited values must be kept (see README).
alter table documents
    -- keep this list in sync with DOCUMENT_TYPES in apps/worker/src/classify.ts
    add column document_type text check (document_type in (
        'contract', 'invoice', 'receipt', 'payslip', 'bank_statement', 'tax',
        'insurance', 'medical', 'identity', 'certificate', 'letter', 'other'
    )),
    add column title text,
    -- ISO 639-1 code of the document's main language
    add column language text check (language ~ '^[a-z]{2}$'),
    -- people and organisations the document names
    add column parties text[],
    -- array of { date: 'YYYY-MM-DD', label }
    add column dates jsonb check (jsonb_typeof(dates) = 'array'),
    -- in English, whatever the document's language
    add column summary text,
    -- a document is either fully classified or not at all
    add constraint documents_classification_check
        check (num_nulls(document_type, title, language, parties, dates, summary) in (0, 6));

-- Down Migration

alter table documents
    drop constraint documents_classification_check,
    drop column summary,
    drop column dates,
    drop column parties,
    drop column language,
    drop column title,
    drop column document_type;
