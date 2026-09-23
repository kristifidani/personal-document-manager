-- Up Migration

-- Where the uploaded file lives under STORAGE_DIR (see src/plugins/storage.ts).
-- NOT NULL with no default: safe only because this table is pre-launch and
-- has never held rows outside fresh dev/CI databases. A pre-existing row
-- has no file to point to, so there's nothing to backfill; if this table
-- ever holds real data before a migration like this runs, that data loss
-- has already happened and needs a real decision, not a fabricated default.
alter table documents add column storage_path text not null;

-- Down Migration

alter table documents drop column storage_path;
