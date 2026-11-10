# Interview Companion

A local workspace for technical interviewers, with a read-only MCP server. The full spec is GitHub issue #1; the work is split into issues #2–#19.

## Read before changing anything

- `GLOSSARY.md`: use these terms in code, tests, docs, and issues. Do not invent synonyms.
- `docs/decisions.md` and `docs/adr/`: decisions already made. Do not reverse one without asking.
- `docs/architecture.md` and `docs/workspace-wireframe.md`: the planned shape.

## Rules

- Three modules: `core` holds every rule and all data access; `web` and `mcp` only call `core`. No business rule is written twice.
- Tests go through `core`'s public interface against a real temporary SQLite file. AI tests use the fake provider. MCP tests use the SDK's in-memory client. No automated UI tests.
- Build test-first with the `tdd` skill.
- Use fictional data only. Real candidate data never enters the repository.
- When you make a decision that is not already recorded, add a row to `docs/decisions.md` in the same change: decision, why, rejected alternative.
- Write all repository text in plain, clear, professional English.
- Never add AI attribution to commits or pull requests.
