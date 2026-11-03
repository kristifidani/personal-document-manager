# End-to-end tests (`apps/e2e`)

Setup and how it works: @README.md

TypeScript (CommonJS) on `node:test`, no dependencies.

- If a test needs state the API doesn't expose, raise it rather than reading the database.
- Start apps with `startStack` in `test/helper.ts`, which also stops them; never spawn an app directly in a test.
- A single-file run always needs `npm run test:setup` first: a sample uploaded by an earlier run is a duplicate (409).
