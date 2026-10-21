-- Up Migration
-- Adds the classify job, which the worker queues when extract finishes; keep this list in sync with apps/worker/src/handlers.ts.

alter table jobs
    drop constraint jobs_job_type_check,
    add constraint jobs_job_type_check check (job_type in ('extract', 'classify'));

-- Down Migration

delete from jobs where job_type = 'classify';
alter table jobs
    drop constraint jobs_job_type_check,
    add constraint jobs_job_type_check check (job_type in ('extract'));
