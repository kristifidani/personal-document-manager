# Backend (`apps/backend`)

Setup and scripts: @README.md

Fastify + TypeScript (CommonJS). `npm run check` must pass before a PR.

- `src/plugins/` and `src/routes/` are auto-loaded (see `src/app.ts`): add a file, don't register it. Wrap plugins with `fastify-plugin` and give them a `name`; declare `dependencies` for ordering, since autoload doesn't guarantee it. Every route declares a JSON `response` schema.
- Errors: a route only throws; `src/plugins/error-handler.ts` builds every error response. An expected failure is an error made with `createError` from `@fastify/error`: a stable `code`, a 4xx status and a message written for the client. Any other error reaches the client as a generic 500, so never set `statusCode` on a plain `Error`.
- Tests run against the real database, so it must be up and migrated. `npm test` wipes all data first (`test/reset-data.ts`). Single-file runs skip the wipe; run `npm run data:reset` for a clean slate.
- Run one test: `node --test -r ts-node/register test/routes/health.test.ts`
