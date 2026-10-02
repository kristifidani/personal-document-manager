-- Up Migration
-- Restricts jobs.job_type to the types the worker handles; keep this list in sync with apps/worker/src/handlers.ts.

alter table jobs add constraint jobs_job_type_check check (job_type in ('extract'));

-- Down Migration

alter table jobs drop constraint jobs_job_type_check;
