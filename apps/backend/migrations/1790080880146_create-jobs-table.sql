-- Up Migration
-- Job queue shared with the worker, which claims rows with FOR UPDATE SKIP LOCKED.

-- MVP: no retries; add attempts/error columns when the worker needs them.
create table jobs (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references documents (id) on delete cascade,
    job_type text not null,
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'done', 'failed')),
    created_at timestamptz not null default now()
);

-- Speeds up the worker's claim query: WHERE status = 'pending' ORDER BY created_at.
create index jobs_status_created_at_idx on jobs (status, created_at);

-- Down Migration

drop table jobs;
