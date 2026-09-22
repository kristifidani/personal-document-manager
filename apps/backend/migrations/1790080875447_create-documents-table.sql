-- Up Migration

-- Single-user app (see README): no owner/user_id column by design.
create table documents (
    id uuid primary key default gen_random_uuid(),
    filename text not null,
    mime_type text not null,
    size_bytes bigint not null check (size_bytes >= 0),
    created_at timestamptz not null default now()
);

-- Down Migration

drop table documents;
