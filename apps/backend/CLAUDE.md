# Backend (`apps/backend`)

Setup and scripts: @README.md

Fastify + TypeScript (CommonJS). `npm run check` must pass before a PR.

- `src/plugins/` and `src/routes/` are auto-loaded (see `src/app.ts`): add a file, don't register it. Wrap plugins with `fastify-plugin` and give them a `name`; declare `dependencies` for ordering, since autoload doesn't guarantee it. Every route declares a JSON `response` schema.
- Errors: a route only throws; `src/plugins/error-handler.ts` builds every error response and decides what reaches the client. An expected failure is a `createError` error from `@fastify/error` with a stable `code`, a 4xx status (502 when a provider we call fails) and a message written for the client; never set `statusCode` on a plain `Error`.
- Tests run against the real database, so it must be up and migrated. `npm test` wipes all data first (`test/reset-data.ts`). Single-file runs skip the wipe; run `npm run data:reset` for a clean slate.
- Test files run serially (`--test-concurrency=1`): they share one database, and Ask reads every classified document in it, so a test that needs a known catalogue would race other files.
- Run one test: `node --test -r ts-node/register test/routes/health.test.ts`
