# Personal Document Manager — notes for Claude Code

Product scope, architecture and the reasoning behind each decision: @README.md

## Working process

- Work in small, single-purpose tickets — one ticket = one branch = one PR. Never scaffold or implement multiple layers/apps in one pass.
- Exception: small, unrelated fixes may share one PR, with one commit per fix.
- There is no fixed roadmap. After a ticket's PR is merged, recommend what to do next and let the user decide the next step and its size.
- Branch per ticket off `main`, open a PR, don't commit straight to `main`.
- Never run `git add`, `git commit`, `git push`, or open a PR without explicit approval first — make the changes and summarize them; the user stages and commits.
- Treat a review comment as a claim to verify, not an instruction: say which comments you agree with and why before changing code.
- Before a PR is merged, review its whole diff against `main` one last time: look for anything missed, unused or simpler, and report the findings.

## Decision-making rules

- Don't invent library behavior, API shapes, or config values — check the actual file in the repo instead of assuming. If something genuinely doesn't exist yet (a file, a command, a dependency), say so rather than describing it as if it's already there.
- If a request conflicts with an established repository decision, including the architecture in [README.md](README.md), say so explicitly instead of quietly working around it or picking a side.
- State assumptions out loud when a request is ambiguous, instead of silently picking one interpretation.

## Code style

- Consistency across the whole project comes first: the stack is TypeScript end to end, so a new file, app or feature mirrors how the existing code already does it (file names, libraries, config, scripts, tooling, error handling, naming, structure). Deviate only for a concrete reason, and state that reason in the PR (or in a comment if the code would otherwise look inconsistent).
- Lint and compiler checks are strict by default. Relax a rule only when it flags idiomatic code rather than a real risk, with a one-line reason, in the shared config (or in an app's config when only that app needs it); never rewrite idiomatic code just to satisfy a rule.
- A new environment variable is added to the app's env schema and its `.env.example` in the same PR.
- Respect service boundaries: don't mix backend, AI/worker, and frontend logic.
- Code used by more than one app lives in `packages/shared`, one subpath export per area (`shared/claude`), imported as TypeScript source with no build step, so it must use only erasable syntax. Server-only subpaths (`shared/claude` needs the API key) are never imported by the frontend.
- Name things for what they are, and never give a type the same name as the function that takes it; a parameter type only one function uses stays inline in its signature.
- Order a file in the order its code runs: shared pieces first, then each step with its own constants and helpers, then the entry point that ties the steps together.
- KISS and DRY, in code, comments and docs alike: the simplest design that does today's job, and one home for each piece of logic or fact. Extract shared code at its second real use, not before.
- Add nothing ahead of need: no column, field, option, env var or dependency without something that uses it now, and prefer the standard library over a new dependency. Before finishing a ticket, check for redundant or unused code and dependencies.
- Env vars hold what differs between deployments: URLs, paths, secrets, log level. Tuning choices (model ids, effort, token limits, intervals) are constants next to the code that uses them, since changing one means re-testing it.

## Testing

- Integration tests (on `node:test`) test one app through its own interface: backend routes over HTTP (`app.inject`); plugins, the schema and the worker's functions directly. They run against the real database, storage directory and Claude API. The apps share only the database, so the other app is replaced by the rows it would have written; a test never calls into another app.
- A test's input matches what the code under test reads. A file comes from the root `samples/` folder (shared with `requests.http`), or is built in code only when it must be a placeholder or deliberately broken. Rows are inserted with made-up text written for the test.
- No mocks of the database, storage or Claude. `t.mock` is only for a failure that can't be produced for real (the database going down), and a spy may wrap the real function to observe it.
- Tests that call Claude use the developer's `ANTHROPIC_API_KEY`. Keep those calls few and small, since each run costs money.
- A flow that spans apps (upload, then the worker processes the job) belongs in an end-to-end test in `apps/e2e`, not in either app's integration tests. End-to-end tests are black box, with no mocks and no inserted rows: they start each app with its own `npm start`, upload samples and go through the HTTP API only, never importing from an app or querying the database.
- Every new or changed behaviour ships with a test in the same PR, including its failure paths. A bug fix ships with a test that fails without the fix.
- One test per behaviour, named after it. When a change adds an effect to an existing action, extend that action's test instead of adding a second one.
- A new action gets its own test and reuses earlier behaviour as setup through a helper, never by copying it.

## API

- JSON field names in requests and responses are snake_case, matching the database columns; types in `packages/shared` use the same names.

## SQL

- Queries are raw SQL through `pg`. Pass every value as a parameter (`$1`); never build SQL from input. Only constants defined in code, such as a shared column list, may be interpolated.
- Name the columns a query returns, no `select *`, and type the rows with an interface matching what `pg` returns.
- Writes that must succeed or fail together share one transaction.
- Lowercase keywords; snake_case names; plural table names.
- Enforce invariants in the schema (`not null`, `check`, foreign keys with an explicit `on delete`), not only in code.
- Migrations are plain SQL with a working down. Never edit a merged migration; add a new one.
- A query that looks up a subset of a table that grows gets an index, with a comment naming that query. A query that reads all or nearly all rows, such as a full list, doesn't: Postgres scans the table either way.

## Security and privacy

- Samples are fictional; never commit a real document, even for a quick test.
- Documents are personal: never log file contents or extracted text, and never put them in error messages.
- Validate every request input (params, query, body) in the route's JSON schema before it reaches a query or the file system.
- Never build a file path from user input; stored files are named by document id.
- Secrets come from environment variables only; never commit or log them.
- The repo is public, docs and instruction files included: no hostnames, internal URLs, account details or personal information anywhere in it.
- Document content leaves the host only for the AI provider the README decides on.

## Dependencies

The repo is one npm workspace (`apps/*`, `packages/*`) with a single root lockfile.

- Install from the repo root (`npm install`, `npm ci`) so use of the shared lockfile and workspace-wide install is explicit; npm otherwise discovers the workspace root even when invoked inside an app directory.
- Dev tools shared by the apps (TypeScript, ESLint, Prettier, knip, ts-node, `@types/*`) are declared once, in the root `package.json`. An app's `package.json` declares its own runtime dependencies, even when another app uses the same one.
- Pins (recheck against the npm registry before changing):
  - TypeScript is pinned `~6.0.x`: `typescript-eslint` declares peer `typescript >=4.8.4 <6.1.0`.
  - `@types/node` follows the runtime major (see `engines` in each app).

## Comments

- Document each module once, in the TSDoc comment on its main export: what it is, why it exists, and where it plugs in. Add a file header only when a file has no single main export (tests, SQL, config).
- Every other exported or shared symbol gets a TSDoc comment. Don't restate types; use `@param`/`@returns`/`@throws` only when they add meaning.
- Inside functions with several phases, mark each phase with a short step comment (`// validate upload`, `// persist document and job`). Never narrate single lines.
- Add a "why" comment only where the code isn't self-evident. Describe the code as it is now, not how it got there.
- Keep comments short and plain: one line where possible, simple words, one idea per sentence, nothing the code or another comment already says. A comment that needs a second read gets rewritten.
- Prefix deliberate MVP simplifications with `MVP:`, stating the limit and, unless the README already owns that decision, what would make us revisit it.

## Where information lives

Each fact has exactly one home; don't restate it elsewhere.

- **Code comments**: how and why each piece of code behaves as it does. The end-to-end flow belongs to the app README; don't restate it.
- **`.env.example`**: what each environment variable means; code that reads it doesn't restate it.
- **Root README**: product, architecture and major decisions — high level only.
- **App READMEs**: how a human sets up, runs and manually tests that app, and how it works end to end (the flow between its modules and what happens on failure); `package.json` is the command reference.
- **CLAUDE.md**: rules an agent can't infer from the code.
- **`.github/copilot-instructions.md`**: what Copilot code review prioritises and skips; it points here for conventions.
- **PRs and git history**: progress, status, changes and bug write-ups. Docs are not a changelog or roadmap.

A change that makes a comment or doc wrong updates it in the same PR.

## Repo etiquette

- Branches: `feature/<short-name>`, `fix/<short-name>`, `chore/<short-name>`.
- Commits and PR titles: `<type>: <summary>` with type `feat`, `fix`, `chore`, `docs` or `test`; imperative mood, explain _why_ over _what_ in the body when it's not obvious from the diff.
