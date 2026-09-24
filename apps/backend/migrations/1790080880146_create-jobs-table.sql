-- Up Migration
-- Job queue for async document processing.

-- MVP: no retries; add attempts/error columns when job processing needs them.
create table jobs (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references documents (id) on delete cascade,
    job_type text not null,
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'done', 'failed')),
    created_at timestamptz not null default now()
);

-- Speeds up claiming the oldest pending job: WHERE status = 'pending' ORDER BY created_at.
create index jobs_status_created_at_idx on jobs (status, created_at);

-- Down Migration

drop table jobs;
