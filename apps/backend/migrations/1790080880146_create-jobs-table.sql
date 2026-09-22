-- Up Migration

-- Postgres-as-queue (see README): the worker claims rows with
-- `FOR UPDATE SKIP LOCKED`. First cut — extend with attempts/error columns
-- when the worker ticket needs retry handling.
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
