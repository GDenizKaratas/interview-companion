# Contributing

Thank you for your interest. Interview Companion is a small project with a few firm rules. Please read them before you open a pull request.

## Before you start

- Open an issue first for anything larger than a small fix, so we can agree on the shape before you write code.
- Read [GLOSSARY.md](GLOSSARY.md) and use its terms in code, tests, and docs. Do not invent synonyms.
- Read [docs/decisions.md](docs/decisions.md) and [docs/adr](docs/adr). A pull request that reverses a recorded decision needs a discussion in an issue first.

## Rules

- **Three modules.** `core` holds every rule and all data access. `web` and `mcp` only call core's public interface, `src/core/index.ts`; lint enforces this. No business rule is written twice.
- **Tests first, through core's public interface**, against a real temporary SQLite file. AI tests use the fake provider in `src/core/testing`. MCP tests use the SDK's in-memory client. There are no automated UI tests.
- **Fictional data only.** Never add a real person's CV, Transcript, or name, not even in a test or an issue.
- **No verdicts.** Nothing that scores, ranks, compares, or recommends Candidates.
- **Record decisions.** If your change makes a decision that is not recorded yet, add a row to `docs/decisions.md`: the decision, why, and the alternative you rejected.
- **Plain English** in all repository text.

## Checks

All three must pass:

```sh
npm run typecheck
npm run lint
npm test
```

## Pull requests

Keep a pull request to one change, say what it changes for the Interviewer, and link the issue it closes.
