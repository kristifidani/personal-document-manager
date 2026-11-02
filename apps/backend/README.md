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

## How it works

`src/app.ts` loads every plugin in `src/plugins/` (config, database pool, storage, upload parsing, errors), then every route in `src/routes/`.

**Upload** (`POST /documents`):

1. The file streams to `STORAGE_DIR` under a new document id and is hashed on the way.
2. The document and a `pending` `extract` job are inserted in one transaction. The [worker](../worker/README.md) takes it from there.
3. If anything fails, including the same file uploaded twice (`409`), the stored file is removed, so nothing is left half-saved.

A document has no status column: every read derives `status` from its jobs, so it follows the worker's progress on its own.

**Ask** (`POST /ask`) makes two Claude calls. Only classified (`done`) documents take part.

1. Load the catalogue: the type, title and English summary of every classified document.
2. Claude reads the catalogue and the question and picks the documents that answer it. If it picks none, `answer` is `null` and the request stops here.
3. Load every page of the picked documents.
4. Claude answers from those pages and cites the ones it used.

The response is `{ documents, answer, citations: [{ document_id, page }] }`. With the six samples, a question costs under a cent (about 2,800 input tokens) and takes 3–4 s. The first call grows by about 200 tokens per classified document.

**Delete** (`DELETE /documents/:id`) removes the row, its jobs and pages, and the stored file in one transaction. It works while a job runs: that job then fails or updates nothing.

## Errors

Every error response has the same body, and the HTTP status carries the category:

```json
{ "code": "DOCUMENT_NOT_FOUND", "message": "Document not found" }
```

`code` is a stable name to match on; `message` is for a human and may be reworded. A failing provider (Claude) answers 502. A failure the API did not expect answers 500 with `INTERNAL_ERROR`, and its detail goes to the server log only.
