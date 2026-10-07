# End-to-end tests (`apps/e2e`)

Setup and how it works: @README.md

TypeScript (CommonJS) on `node:test`, no dependencies. `npm run check` must pass before a PR.

- Black box: never import from another app or query the database. Reach an app's state through the HTTP API; if a test needs state the API doesn't expose, raise it rather than reading the database.
- Start apps with `startStack` in `test/helper.ts`, which also stops them; never spawn an app directly in a test.
- Tests run serially (`--test-concurrency=1`): every test starts the apps on port 3100 against the same database, so parallel files would collide on the port and claim each other's jobs.
- Run one test: `node --test -r ts-node/register test/upload.test.ts`
