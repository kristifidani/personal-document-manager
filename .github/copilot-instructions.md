# Code review instructions

The rules are in `CLAUDE.md` (root and per app); architecture and its decisions are in `README.md`. When performing a code review, check the diff against both and name the rule a comment relies on.

## Prioritise

- Correctness bugs and unhandled failure paths.
- Queue and transaction safety: job claiming relies on `FOR UPDATE SKIP LOCKED`; flag work that could double-process or lose a job.
- Tests that would still pass without the change they are meant to cover.
- Broken rules from the Testing, SQL, Security and privacy, and Where information lives sections of `CLAUDE.md`.
- Changes that contradict a decision in `README.md` without saying so.

## Skip

- Formatting and unused code or dependencies: Prettier, ESLint and knip enforce them in CI.
- Style preferences that no rule in `CLAUDE.md` backs, such as import order.
- Suggestions to add a dependency or abstraction without a concrete problem it solves.
