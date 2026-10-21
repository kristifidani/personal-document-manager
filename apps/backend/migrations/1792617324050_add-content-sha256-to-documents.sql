-- Up Migration
-- Fingerprint of each document's file, so the same file is never stored twice (see POST /documents in src/routes/documents.ts).

-- No default: a file's hash can't be computed in SQL. A database that already has documents needs `npm run data:reset` first.
alter table documents
    add column content_sha256 text not null
        constraint documents_content_sha256_check check (content_sha256 ~ '^[0-9a-f]{64}$')
        -- the route matches this name to answer 409
        constraint documents_content_sha256_key unique;

-- Down Migration

alter table documents drop column content_sha256;
