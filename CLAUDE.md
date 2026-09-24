# Personal Document Manager — notes for Claude Code

Product scope, architecture and the reasoning behind each decision: @README.md

## Working process

- Work in small, single-purpose tickets — one ticket = one branch = one PR. Never scaffold or implement multiple layers/apps in one pass.
- There is no fixed roadmap. After a ticket's PR is merged, recommend what to do next and let the user decide the next step and its size.
- Branch per ticket off `main`, open a PR, don't commit straight to `main`.
- Never run `git add`, `git commit`, `git push`, or open a PR without explicit approval first — make the changes and summarize them; the user stages and commits.
- When a ticket is ready, draft its PR description from `.github/pull_request_template.md`.

## Decision-making rules

- Don't invent library behavior, API shapes, or config values — check the actual file in the repo instead of assuming. If something genuinely doesn't exist yet (a file, a command, a dependency), say so rather than describing it as if it's already there.
- If a request conflicts with an established repository decision, including the architecture in [README.md](README.md), say so explicitly instead of quietly working around it or picking a side.
- State assumptions out loud when a request is ambiguous, instead of silently picking one interpretation.

## Code style

- Follow whatever pattern already exists in the file/module being touched (error handling, naming, structure) over introducing a new one.
- Modular, typed, idiomatic code; descriptive names; short TODOs.
- Respect service boundaries: don't mix backend, AI/worker, and frontend logic.
- Keep dependencies minimal — prefer the standard library where reasonable.
- Before finishing a ticket, check for redundant or unused code/dependencies and anything added ahead of need; keep things simple.

## Comments

- Document each module once, in the TSDoc comment on its main export: what it is, why it exists, and where it plugs in. Add a file header only when a file has no single main export (tests, SQL, config).
- Every other exported or shared symbol gets a TSDoc comment. Don't restate types; use `@param`/`@returns`/`@throws` only when they add meaning.
- Inside functions with several phases, mark each phase with a short step comment (`// validate upload`, `// persist document and job`). Never narrate single lines.
- Add a "why" comment only where the code isn't self-evident. Describe the code as it is now, not how it got there.
- Prefix deliberate MVP simplifications with `MVP:`, stating the limit and, unless the README already owns that decision, what would make us revisit it.

## Where information lives

Each fact has exactly one home; don't restate it elsewhere.

- **Code comments**: how and why the code behaves as it does.
- **Root README**: product, architecture and major decisions — high level only.
- **App READMEs**: how a human sets up and runs that app; `package.json` is the command reference.
- **CLAUDE.md**: rules an agent can't infer from the code.
- **PRs and git history**: progress, status, changes and bug write-ups. Docs are not a changelog or roadmap.

A change that makes a comment or doc wrong updates it in the same PR.

## Repo etiquette

- Branches: `feature/<short-name>`, `fix/<short-name>`, `chore/<short-name>`.
- Commits: imperative mood, explain _why_ over _what_ in the body when it's not obvious from the diff.
