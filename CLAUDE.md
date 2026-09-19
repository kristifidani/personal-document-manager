# Personal Document Manager — notes for Claude Code

Single-user personal document manager. Full scope lives in the product
brief; planned architecture is summarized in [README.md](README.md).

## Working process (important — this is how this repo is built)

- Work in small, single-purpose tickets — one ticket = one branch = one PR.
  Never scaffold or implement multiple layers/apps in one pass.
- There is no fixed upfront roadmap. After a ticket's PR is reviewed and
  merged, propose what would make sense next and let the user decide how
  much to take on next — don't assume the next step but rather make recommended suggestion.
- Branch per ticket off `main`, open a PR, don't commit straight to `main`.
- Never run `git commit`, `git push`, or open a PR without explicit approval
  first — stage changes and summarize them, then wait to be told to commit/push.

## Decision-making rules

- Don't invent library behavior, API shapes, or config values — check the
  actual file in the repo instead of assuming. If something genuinely
  doesn't exist yet (a file, a command, a dependency), say so rather than
  describing it as if it's already there.
- If a request conflicts with a decision below, say so explicitly instead
  of quietly working around it or picking a side.
- State assumptions out loud when a request is ambiguous, instead of
  silently picking one interpretation.

## Planned architecture decisions (settled direction — flag conflicts, don't relitigate silently)

None of this exists in the repo yet; these are decisions for what gets
built as tickets land, not a description of current code.

- Modular monolith: `apps/frontend` (React/Vite), `apps/backend` (Node/Fastify),
  `apps/worker` (Python, for OCR/extraction/embeddings), `packages/shared`
  (TS types shared between web and api).
- API and worker are meant to coordinate only through Postgres — a `jobs`
  table as the queue (`FOR UPDATE SKIP LOCKED`), no Redis/broker. Deliberate
  simplification for a solo-dev MVP.
- Synchronous work (CRUD, search, the eventual Ask/RAG endpoint) belongs in
  `apps/backend`. Slow per-document work (OCR, extraction, embeddings) belongs
  in `apps/worker`, triggered by a `jobs` row.
- Extracted AI metadata should stay reviewable/correctable, not silently
  overwritten once a user edits it.
- Source-aware by default: any answer or search result derived from a
  document should carry back a `document_id` (+ page/section where
  available), not just prose.

## Code style

- Read before writing: infer context from the current file and related
  modules before editing; verify imports/routes/types actually exist
  rather than assuming.
- Follow whatever pattern already exists in the file/module being touched
  (error handling, naming, structure) over introducing a new one.
- Modular, typed, idiomatic code; descriptive names; minimal comments and
  short TODOs.
- Respect service boundaries: don't mix backend, AI/worker, and frontend
  logic across `apps/*` (see the architecture decisions above).
- Keep dependencies minimal — prefer the standard library where reasonable.

## Backend (`apps/backend`)

Fastify 5 + TypeScript (CommonJS), scaffolded with `npm init fastify -- --lang=ts`.
`src/routes/` is auto-loaded by `@fastify/autoload` — add a file there, don't
register it by hand in `app.ts`. There is no `src/plugins/` yet: autoload throws
on a missing directory and `tsc` doesn't emit empty ones, so add the folder and
its autoload registration together with the first plugin. Every route declares a
JSON `response` schema. Run all commands from `apps/backend` (no npm workspaces yet).

- `npm run check` — lint + format check + typecheck + tests; must pass before a PR
- `npm test` — `node:test` via ts-node (run one file:
  `node --test -r ts-node/register test/routes/health.test.ts`)
- `npm run dev` — runs `src/app.ts` through ts-node with watch on port 3000;
  `npm run lint:fix` / `npm run format`
- `npm start` — compiles to `dist/` and runs the compiled app
- Tests live in `test/**/*.test.ts` and build the app via `test/helper.ts`.

## Dependency notes (verified against the npm registry, recheck before changing)

- TypeScript is `^6.0.3`, not 7.x (npm `latest`): `typescript-eslint` declares
  peer `typescript >=4.8.4 <6.1.0`. Re-evaluate when it supports 7.x.
- TS 6 needs explicit `rootDir` and `types: ["node"]` in `tsconfig.json`.
- `@types/node` follows the runtime major (Node 24, see `engines`).
- ESLint runs with type-aware rules; `require-await` is off on purpose
  (Fastify plugins/handlers are `async` by convention).

## Repo etiquette

- Branches: `feature/<short-name>`, `fix/<short-name>`, `chore/<short-name>`.
- Commits: imperative mood, explain _why_ over _what_ in the body when it's
  not obvious from the diff.
