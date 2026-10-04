# Code review instructions

Conventions live in `CLAUDE.md` (root and per app); architecture and its decisions live in `README.md`. When performing a code review, flag changes that contradict either instead of restating them.

## Prioritise

- Correctness bugs and unhandled failure paths.
- Service-boundary violations: backend, worker and frontend logic must not mix, and the schema belongs to the backend.
- Queue and transaction safety: job claiming relies on `FOR UPDATE SKIP LOCKED`; flag work done outside the claiming transaction that could double-process or lose a job.
- Migrations without a working down migration.
- New behaviour without a test, and tests that would pass without the change.
- Comments, READMEs or `.env.example` entries the diff makes wrong.
- Code, config or dependencies added ahead of need.

## Skip

- Formatting, import order and unused code or dependencies: Prettier, ESLint and knip enforce them in CI.
- Style preferences that no rule in `CLAUDE.md` backs.
- Suggestions to add a dependency or abstraction without a concrete problem it solves.
