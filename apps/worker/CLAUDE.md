# Worker (`apps/worker`)

Setup and scripts: @README.md

Plain Node + TypeScript (CommonJS), no framework, with no npm workspaces yet. `npm run check` must pass before a PR.

- The schema belongs to the backend: add migrations in `apps/backend/migrations`, never here.
- Run one test: `node --test -r ts-node/register test/env.test.ts`

## Dependency pins (recheck against the npm registry before changing)

Same pins as `apps/backend/CLAUDE.md`: TypeScript `~6.0.x` for `typescript-eslint`, `@types/node` follows the runtime major.
