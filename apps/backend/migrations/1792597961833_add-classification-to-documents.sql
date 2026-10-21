-- Up Migration
-- What the worker's classify job reads from each document's text; the summary feeds the Ask catalogue. All null until the document is classified.

alter table documents
    -- keep this list in sync with DOCUMENT_TYPES in apps/worker/src/classify.ts
    add column document_type text check (document_type in (
        'contract', 'invoice', 'receipt', 'payslip', 'bank_statement', 'tax',
        'insurance', 'medical', 'identity', 'certificate', 'letter', 'other'
    )),
    add column title text,
    -- in English, whatever the document's language
    add column summary text,
    -- a document is either fully classified or not at all
    add constraint documents_classification_check
        check (num_nulls(document_type, title, summary) in (0, 3));

-- Down Migration

alter table documents
    drop constraint documents_classification_check,
    drop column summary,
    drop column title,
    drop column document_type;
