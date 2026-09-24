# Backend

The API of the [Personal Document Manager](../../README.md), built with Fastify and TypeScript.

## Getting started

Requires Docker and the Node version in `package.json` (`engines`). Run everything from this directory.

```bash
npm install
cp .env.example .env
docker compose -f ../../infra/db/docker-compose.yml up -d
npm run migrate:up
npm run dev
```

All scripts are in `package.json`.
