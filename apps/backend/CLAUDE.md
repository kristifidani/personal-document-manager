# Backend (`apps/backend`)

Setup and scripts: @README.md

Fastify + TypeScript (CommonJS). `npm run check` must pass before a PR.

- `src/plugins/` and `src/routes/` are auto-loaded (see `src/app.ts`): add a file, don't register it. Wrap plugins with `fastify-plugin` and give them a `name`; declare `dependencies` for ordering, since autoload doesn't guarantee it. Every route declares a JSON `response` schema.
- Errors: a route only throws; `src/plugins/error-handler.ts` builds every error response and decides what reaches the client. An expected failure is a `createError` error from `@fastify/error` with a stable `code`, a 4xx status (502 when a provider we call fails) and a message written for the client; never set `statusCode` on a plain `Error`.
- Tests run against a real database of their own and their own storage directory (`.env.test`, loaded by `test/helper.ts`), so they never touch dev data. `npm test` first migrates it and wipes it (`npm run test:setup`). Single-file runs skip that; run `npm run test:setup` for a clean slate.
- Test files run serially (`--test-concurrency=1`): they share one database, and Ask reads every classified document in it, so a test that needs a known catalogue would race other files.
- Run one test: `node --test -r ts-node/register test/routes/health.test.ts`
