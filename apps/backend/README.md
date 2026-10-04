# Backend

The API of the [Personal Document Manager](../../README.md), built with Fastify and TypeScript.

## Getting started

Requires Docker and the Node version in `package.json` (`engines`). Install dependencies from the repo root first (see the [root README](../../README.md#getting-started)), then run everything from this directory.

```bash
cp .env.example .env
docker compose -f ../../infra/db/docker-compose.yml up -d
npm run migrate:up
npm run dev
```

All scripts are in `package.json`. To try the API by hand, use [`requests.http`](requests.http) with the REST Client VS Code extension.

## Errors

Every error response has the same body, and the HTTP status carries the category:

```json
{ "code": "DOCUMENT_NOT_FOUND", "message": "Document not found" }
```

`code` is a stable name to match on; `message` is for a human and may be reworded. A failure the API did not expect answers 500 with `INTERNAL_ERROR`, and its detail goes to the server log only.
