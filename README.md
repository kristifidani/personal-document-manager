# Personal Document Manager

A private, single-user document manager: upload documents, let AI extract
structure (type, entities, dates, obligations), search/ask across the
collection in natural language, and track important deadlines.

## Planned architecture

Modular monolith, split by workload rather than by microservice:

```text
apps/frontend      React + Vite frontend
apps/backend      Node + Fastify — CRUD, auth, search, synchronous Ask/RAG endpoint
apps/worker   Python — async document pipeline (OCR/text extraction,
              classification & extraction via LLM, embeddings)
packages/shared  TypeScript types shared between web and api
```

Node and Python are meant to coordinate through Postgres only (a `jobs`
table as a lightweight queue) — no separate broker. See
[CLAUDE.md](CLAUDE.md) for the reasoning.

## Status

Empty scaffold — folder structure only, no code yet. Built incrementally,
one small ticket/PR at a time; see [CLAUDE.md](CLAUDE.md) for working
conventions.
