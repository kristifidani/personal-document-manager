-- Up Migration
-- Records why a job failed: the message of the error its handler threw. Only a failed job has one.

alter table jobs
    add column error text,
    add constraint jobs_error_check check (status = 'failed' or error is null);

-- Down Migration

alter table jobs
    drop constraint jobs_error_check,
    drop column error;
