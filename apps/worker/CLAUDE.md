# Worker (`apps/worker`)

Setup, how it works and manual testing: @README.md

Plain Node + TypeScript (CommonJS), no framework.

- The schema belongs to the backend: add migrations in `apps/backend/migrations`, never here.
- Errors: handlers throw plain `Error`s and only `runOnce` catches them. It stores the thrown error's `message` in `jobs.error`, so when a third-party error could quote document content, wrap it (`new Error('…', { cause })`) with a message of our own.
- Logging: never `console`, and never a logger parameter inside the worker (shared code takes one; pass it `logger()`). Log with `logger()` from `src/logger.ts`; inside a job it already adds the job's id, so don't repeat it. Field names are snake_case.
