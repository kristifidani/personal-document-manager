# Worker (`apps/worker`)

Setup, how it works and manual testing: @README.md

Plain Node + TypeScript (CommonJS), no framework. `npm run check` must pass before a PR.

- The schema belongs to the backend: add migrations in `apps/backend/migrations`, never here.
- Errors: handlers throw plain `Error`s and only `runOnce` catches them. It stores the thrown error's `message` in `jobs.error`, so when a third-party error could quote document content, wrap it (`new Error('…', { cause })`) with a message of our own.
- Logging: never `console`, and never a logger parameter. Log with `logger()` from `src/logger.ts`; inside a job it already adds the job's id, so don't repeat it. Field names are snake_case. Never log a document's text or bytes.
- Tests run against the real database, so it must be up and migrated. `npm test` wipes all data first through the backend's reset (`npm run data:reset`), which reads `apps/backend/.env`, not this app's. Single-file runs skip the wipe; run `npm run data:reset` for a clean slate.
- Tests run serially (`--test-concurrency=1`), unlike the backend's: they all claim from the same `jobs` queue, so parallel files could claim each other's jobs.
- Run one test: `node --test -r ts-node/register test/queue.test.ts`
