# Worker (`apps/worker`)

Setup, how it works and manual testing: @README.md

Plain Node + TypeScript (CommonJS), no framework. `npm run check` must pass before a PR.

- The schema belongs to the backend: add migrations in `apps/backend/migrations`, never here.
- Errors: handlers throw plain `Error`s and only `runOnce` catches them. It stores the thrown error's `message` in `jobs.error`, so when a third-party error could quote document content, wrap it (`new Error('…', { cause })`) with a message of our own.
- Logging: never `console`, and never a logger parameter inside the worker (shared code takes one; pass it `logger()`). Log with `logger()` from `src/logger.ts`; inside a job it already adds the job's id, so don't repeat it. Field names are snake_case. Never log a document's text or bytes.
- Tests run against the backend's test database and storage (`.env.test`, loaded by `test/helper.ts`), so they never touch dev data and a running dev worker never claims their jobs. `npm test` first migrates and wipes it through the backend (`npm run test:setup`), which reads `apps/backend/.env.test`, not this app's. Single-file runs skip that; run `npm run test:setup` for a clean slate.
- Tests run serially (`--test-concurrency=1`): they all claim from the same `jobs` queue, so parallel files could claim each other's jobs.
- Run one test: `node --test -r ts-node/register test/queue.test.ts`
