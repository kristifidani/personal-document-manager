-- Up Migration
-- Location of each document's file in storage (see src/plugins/storage.ts).

-- No default: added before any real rows existed, so there is nothing to backfill.
alter table documents add column storage_path text not null;

-- Down Migration

alter table documents drop column storage_path;
