# Backend (`apps/backend`)

Fastify 5 + TypeScript (CommonJS). Run all commands from this directory (no npm workspaces yet). `npm run check` must pass before a PR.

- `src/routes/` is auto-loaded by `@fastify/autoload` — add a file there, don't register it in `app.ts`. Every route declares a JSON `response` schema.
- No `src/plugins/` yet: autoload throws on a missing directory and `tsc` doesn't emit empty ones. Add the folder and its autoload registration together with the first plugin.
- `knip.json` declares `src/routes/**` as entry points because autoload hides them from static analysis.
- Config lives in `.env` (copy `.env.example`), loaded by `fastify-cli`. Don't set `-p`/`-l` flags in scripts — CLI flags override env vars.
- Run one test: `node --test -r ts-node/register test/routes/health.test.ts`

## Dependency notes (verified against the npm registry, recheck before changing)

- TypeScript is `^6.0.3`, not 7.x (npm `latest`): `typescript-eslint` declares peer `typescript >=4.8.4 <6.1.0`. Re-evaluate when it supports 7.x.
- TS 6 needs explicit `rootDir` and `types: ["node"]` in `tsconfig.json`.
- `@types/node` follows the runtime major (Node 24, see `engines`).
- ESLint runs with type-aware rules; `require-await` is off on purpose
  (Fastify plugins/handlers are `async` by convention).

Refer to [Backend README](./README.md) for more information.
