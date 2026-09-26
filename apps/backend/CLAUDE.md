# Backend (`apps/backend`)

Setup and scripts: @README.md

Fastify + TypeScript (CommonJS), with no npm workspaces yet. `npm run check` must pass before a PR.

- `src/plugins/` and `src/routes/` are auto-loaded (see `src/app.ts`): add a file, don't register it. Wrap plugins with `fastify-plugin` and give them a `name`; declare `dependencies` for ordering, since autoload doesn't guarantee it. Every route declares a JSON `response` schema.
- Tests run against the real database, so it must be up and migrated. `npm test` wipes all data first (`test/reset-data.ts`). Single-file runs skip the wipe; run `npm run data:reset` for a clean slate.
- Run one test: `node --test -r ts-node/register test/routes/health.test.ts`

## Dependency pins (recheck against the npm registry before changing)

- TypeScript is pinned `~6.0.x`: `typescript-eslint` declares peer `typescript >=4.8.4 <6.1.0`.
- `@types/node` follows the runtime major (see `engines`).
