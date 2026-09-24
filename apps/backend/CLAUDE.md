# Backend (`apps/backend`)

Fastify 5 + TypeScript (CommonJS). Run all commands from this directory (no npm workspaces yet). `npm run check` must pass before a PR.

- `src/plugins/` and `src/routes/` are auto-loaded (see `src/app.ts`): add a file, don't register it. Wrap plugins with `fastify-plugin` and give them a `name`; declare `dependencies` for ordering, since autoload doesn't guarantee it. Every route declares a JSON `response` schema.
- Tests need a running Postgres with migrations applied: `docker compose up -d` in `infra/db/`, then `npm run migrate:up`.
- Migrations are plain SQL with an `-- Up Migration` / `-- Down Migration` pair; create them with `npm run migrate:create -- <name>`.
- Run one test: `node --test -r ts-node/register test/routes/health.test.ts`

## Dependency pins (recheck against the npm registry before changing)

- TypeScript is pinned `~6.0.x`: `typescript-eslint` declares peer `typescript >=4.8.4 <6.1.0`.
- `@types/node` follows the runtime major (see `engines`).
