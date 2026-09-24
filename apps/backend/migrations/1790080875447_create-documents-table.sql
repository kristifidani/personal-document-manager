-- Up Migration
-- Uploaded documents' metadata; the files themselves live in a local storage.

-- MVP: single user, so no owner/user_id column; multi-user support needs one.
create table documents (
    id uuid primary key default gen_random_uuid(),
    filename text not null,
    mime_type text not null,
    size_bytes bigint not null check (size_bytes >= 0),
    created_at timestamptz not null default now()
);

-- Down Migration

drop table documents;
