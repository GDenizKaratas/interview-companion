---
status: accepted
---

# Two AI modes with different guarantees

AI help reaches the Interviewer in two ways. With an API key, the application itself generates AI Notes and Suggested Questions, stores them, and checks every quote against the source before saving. Without a key, an external AI client (Claude Desktop, Claude Code) reads the data through the read-only MCP server and writes a Candidate Brief in its own chat. We chose this so the project is useful without an API key and so MCP does real work instead of being a demo.

## Considered Options

- **In-app AI only**: one set of guarantees, but nothing works without a key and MCP adds little.
- **MCP client only**: far less code, but AI Notes could not be stored, reviewed, or marked Stale.
- **MCP client writes notes back into the application**: keeps one validation path, but makes the MCP server writable. Rejected for the MVP to keep "an external client cannot change your data" true.

## Consequences

- The "AI cannot invent Evidence" guarantee is enforced by code only in the in-app mode. A Candidate Brief is written by an external model that we can instruct but not verify. The README must say this plainly.
- The Candidate Brief is not stored and has no Review State.
