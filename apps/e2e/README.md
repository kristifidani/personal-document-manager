# End-to-end tests

End-to-end tests of the [Personal Document Manager](../../README.md). Each app's own tests fake the other side. This suite runs the real [backend](../backend/README.md) and [worker](../worker/README.md) together and checks the flows that span them, for example: an uploaded PDF's text is served once the worker has processed it.

## Getting started

Set up the backend and the worker first, including the database, its migrations and each app's `.env`: the suite starts both apps, and each one reads its own `.env`. Then run from this directory:

```bash
npm test
```

All scripts are in `package.json`.

## How it works

`npm test` wipes all data first (the backend's `npm run data:reset`), so jobs left over from other test runs don't hold up the worker. Then each test:

1. **Starts** the backend and the worker with their own `npm start`, which builds them first. Both get one fresh temporary storage directory, and the backend runs on port 3100 so it doesn't clash with a dev server on 3000.
2. **Waits** until the backend answers `GET /health`.
3. **Drives** the backend over HTTP only, as the frontend will, and polls until the worker's result shows up in the API.
4. **Stops** both apps with SIGTERM and removes the storage directory.

When a wait times out, the error includes everything both apps printed, so a failed job's error from the worker's log shows there. A port already in use shows up as the backend never answering.
