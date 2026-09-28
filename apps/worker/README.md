# Worker

The background worker of the [Personal Document Manager](../../README.md), built with Node and TypeScript. It processes the jobs the backend queues on upload.

## Getting started

Requires the Node version in `package.json` (`engines`). Run everything from this directory.

```bash
npm install
cp .env.example .env
npm run dev
```

The worker shares the backend's database and storage: set up the [backend](../backend/README.md) first. All scripts are in `package.json`.
