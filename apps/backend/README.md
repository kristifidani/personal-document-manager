# Backend

The API of the [Personal Document Manager](../../README.md), built with Fastify and TypeScript.

## Getting started

Requires Docker and the Node version in `package.json` (`engines`). Install dependencies from the repo root first (see the [root README](../../README.md#getting-started)), then run everything from this directory.

```bash
cp .env.example .env   # then set ANTHROPIC_API_KEY: the backend won't start without it
docker compose -f ../../infra/db/docker-compose.yml up -d
npm run migrate:up
npm run dev
```

All scripts are in `package.json`. To try the API by hand, use [`requests.http`](requests.http) with the REST Client VS Code extension.

## Ask

`POST /ask` takes a `question` and returns the documents that answer it, most relevant first. It loads the catalogue (type, title and summary of every classified document) and sends it to Claude with the question in one request. Claude returns document ids; ids not in the catalogue are dropped. Documents still processing, or whose processing failed, are not in the catalogue. If the request to Claude fails, the answer is `502 ASK_FAILED`.

## Errors

Every error response has the same body, and the HTTP status carries the category:

```json
{ "code": "DOCUMENT_NOT_FOUND", "message": "Document not found" }
```

`code` is a stable name to match on; `message` is for a human and may be reworded. A failing provider (Claude) answers 502. A failure the API did not expect answers 500 with `INTERNAL_ERROR`, and its detail goes to the server log only.
