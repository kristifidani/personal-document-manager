# End-to-end tests

End-to-end tests of the [Personal Document Manager](../../README.md). The suite runs the real [backend](../backend/README.md) and [worker](../worker/README.md) together and checks the flows that span them, using the repo's [samples](../../samples/README.md).

## Getting started

Set up the backend and the worker first, each with its own `.env` and a valid `ANTHROPIC_API_KEY`: the suite starts both apps, and every sample goes through Claude, so a run costs a few cents. Then run from this directory:

```bash
npm test
```

All scripts are in `package.json`.

## How it works

`npm test` first wipes the database the tests use (the backend's `npm run test:setup`), so jobs left over from other test runs don't hold up the worker. Then each test:

1. **Starts** the backend and the worker with their own `npm start`, which builds them first. Both get one fresh temporary storage directory, and the backend gets a free port, so a running dev server doesn't get in the way.
2. **Waits** until the backend answers `GET /health`.
3. **Drives** the backend over HTTP only, as the frontend will, and polls the document until its `status` is `done` or `failed`.
4. **Stops** both apps with SIGTERM and removes the storage directory.

When a wait times out, or an app exits while the test waits (a build error, a missing `.env`), the error includes everything both apps printed, so the worker's log shows there. A job that fails when it should succeed fails the test at once, with the same output: the API reports only `failed`, and the reason is in the worker's log. An app that doesn't stop within 10 s of SIGTERM, such as a worker stuck in a job, is killed and fails the test. Ctrl+C stops both apps too.
