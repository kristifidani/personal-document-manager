# Worker (`apps/worker`)

Setup and scripts: @README.md

Plain Node + TypeScript (CommonJS), no framework, with no npm workspaces yet. `npm run check` must pass before a PR.

- The schema belongs to the backend: add migrations in `apps/backend/migrations`, never here.
- Tests run against the real database, so it must be up and migrated. `npm test` wipes all data first through the backend's reset (`npm run data:reset`), which reads `apps/backend/.env`, not this app's. Single-file runs skip the wipe; run `npm run data:reset` for a clean slate.
- Tests run serially (`--test-concurrency=1`), unlike the backend's: they all claim from the same `jobs` queue, so parallel files could claim each other's jobs.
- Run one test: `node --test -r ts-node/register test/queue.test.ts`

## Dependency pins (recheck against the npm registry before changing)

Same pins as `apps/backend/CLAUDE.md`: TypeScript `~6.0.x` for `typescript-eslint`, `@types/node` follows the runtime major.
