# Backend (`apps/backend`)

Setup and scripts: @README.md

Fastify + TypeScript (CommonJS).

- Wrap plugins with `fastify-plugin` and give them a `name`; declare `dependencies` for ordering, since autoload doesn't guarantee it. Every route declares a JSON `response` schema.
- Errors: a route only throws. An expected failure is a `createError` error from `@fastify/error` with a stable `code` and a message written for the client; `src/plugins/error-handler.ts` decides which status and message reach the client.
