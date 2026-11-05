# Frontend (`apps/frontend`)

Setup and how it works: @README.md

React + Vite + TypeScript, as ESM (Vite expects it; the other apps are CommonJS).

- Call the backend through relative `/api/...` paths, never its URL: the dev server proxies them.
- Tests run on Vitest with Testing Library in jsdom, not `node:test`, since Vitest reuses the Vite config to render components. Test a screen through what it renders, and replace the backend with the HTTP responses it would return.
