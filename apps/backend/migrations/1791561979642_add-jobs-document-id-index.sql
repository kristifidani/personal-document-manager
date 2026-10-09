-- Up Migration
-- Speeds up reading a document's status from its jobs: WHERE document_id = $1 (see src/routes/documents.ts).

create index jobs_document_id_idx on jobs (document_id);

-- Down Migration

drop index jobs_document_id_idx;
