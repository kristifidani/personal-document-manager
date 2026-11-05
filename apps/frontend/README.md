# Frontend

The web UI of the [Personal Document Manager](../../README.md), built with React, Vite and TypeScript.

## Getting started

Install dependencies from the repo root first (see the [root README](../../README.md#getting-started)), then run everything from this directory.

```bash
cp .env.example .env
npm run dev
```

Open the URL Vite prints. The UI calls the API, so run the [backend](../backend/README.md) too. All scripts are in `package.json`.

## How it works

`index.html` loads `src/main.tsx`, which mounts the `App` component from `src/App.tsx`.

In dev, Vite forwards every request under `/api` to the backend at `BACKEND_URL`, without the prefix. To check it, with both running:

```bash
curl localhost:5173/api/health   # {"status":"ok"}, answered by the backend's /health
```

`npm run build` writes the static site to `dist/`.
