# End-to-end tests (`apps/e2e`)

Setup and how it works: @README.md

TypeScript (CommonJS) on `node:test`, no dependencies.

- If a test needs state the API doesn't expose, raise it rather than reading the database.
- Start apps with `startStack` in `test/helper.ts`, which also stops them; never spawn an app directly in a test.
- The data is wiped once per run, and uploading a file twice is a 409: each test uploads samples no other test uploads, and a single-file run needs `npm run test:setup` first.
