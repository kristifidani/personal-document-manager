# Backend

The API of the [Personal Document Manager](../../README.md): Fastify 5 + TypeScript on Node 24.

## Getting started

Requires Node 24+ and Docker. Run everything from this directory.

```bash
npm install
cp .env.example .env
docker compose -f ../../infra/db/docker-compose.yml up -d
npm run dev
```

## Commands

| Command            | What it does                                                                          |
| ------------------ | ------------------------------------------------------------------------------------- |
| `npm run dev`      | Run from source with auto-reload.                                                     |
| `npm start`        | Compile to `dist/` and run the compiled app.                                          |
| `npm test`         | Run the tests (`node:test`).                                                          |
| `npm run check`    | The pre-PR gate: lint, format check, typecheck, unused dependencies (knip) and tests. |
| `npm run lint:fix` | Auto-fix lint issues.                                                                 |
| `npm run format`   | Format all files with Prettier.                                                       |

## Project structure

```text
src/app.ts        App entry point; auto-loads plugins/ then routes/
src/plugins/      Cross-cutting setup (env validation, Postgres pool), registered automatically (@fastify/autoload)
src/routes/       One file per route group, registered automatically (@fastify/autoload)
test/             node:test suites; test/helper.ts builds the app without opening a port
```

## Continuous integration

[backend-ci.yml](../../.github/workflows/backend-ci.yml) runs four parallel jobs on every PR and on merge to `main`:

- **lint**: ESLint, Prettier check and typecheck
- **test**: the test suite, against a Postgres service container
- **build**: TypeScript compilation
- **dependencies**: `npm audit` (high severity and above) and knip for unused dependencies and files
