# Backend (`apps/backend`)

Fastify 5 + TypeScript (CommonJS). Run all commands from this directory (no npm workspaces yet). `npm run check` must pass before a PR.

- `src/routes/` is auto-loaded by `@fastify/autoload` — add a file there, don't register it in `app.ts`. Every route declares a JSON `response` schema.
- `src/plugins/` is auto-loaded the same way, registered before `routes/`. Wrap plugins with `fastify-plugin` (`fp`) and give them a `name`; use `dependencies: ['other-name']` to order them, since autoload doesn't guarantee load order otherwise. `env` (validates/exposes `fastify.config`), `postgres` (`fastify.pg`, depends on `env`), `multipart` (registers `@fastify/multipart`, no deps) and `storage` (`fastify.storage.save`/`remove`, local disk under `STORAGE_DIR`, depends on `env`) are the current ones.
- `knip.json` declares `src/routes/**` and `src/plugins/**` as entry points because autoload hides them from static analysis.
- Config lives in `.env` (copy `.env.example`), loaded two ways: `fastify-cli` reads it for `dev`/`start` (via `process.loadEnvFile()`), and the `env` plugin reads it independently (`dotenv: true`) so tests get the same config without going through fastify-cli. `process.env` wins over `.env` in both.
- `DATABASE_URL` must point at a running Postgres — start one with `docker compose up -d` in `infra/db/` (see [infra/db](../../infra/db)). `STORAGE_DIR` must point at a writable local directory (created automatically at boot if missing).
- `migrations/` holds plain SQL migrations run by `node-pg-migrate` (`npm run migrate:up` / `migrate:down` / `migrate:create -- <name>`). Each file has an `-- Up Migration` / `-- Down Migration` pair. The CLI reads `DATABASE_URL` the same way the app does — via `.env` if present (`node --env-file-if-exists`), else `process.env` — so no separate `dotenv` dependency was needed.
- Run one test: `node --test -r ts-node/register test/routes/health.test.ts`

## Dependency notes (verified against the npm registry, recheck before changing)

- TypeScript is `^6.0.3`, not 7.x (npm `latest`): `typescript-eslint` declares peer `typescript >=4.8.4 <6.1.0`. Re-evaluate when it supports 7.x.
- TS 6 needs explicit `rootDir` and `types: ["node"]` in `tsconfig.json`.
- `@types/node` follows the runtime major (Node 24, see `engines`).
- ESLint runs with type-aware rules; `require-await` is off on purpose
  (Fastify plugins/handlers are `async` by convention).

Refer to [Backend README](./README.md) for more information.
