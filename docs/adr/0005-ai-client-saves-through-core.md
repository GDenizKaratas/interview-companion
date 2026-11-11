---
status: accepted
---

# The AI client may save checked AI work, when the Interviewer allows it

ADR 0002 kept the MCP server read-only: without an API key, an external AI client (Claude Code, Claude Desktop) could read the data and write a Candidate Brief in its own chat, but nothing it wrote came back into the app, and its quotes were never checked.

We now let the AI client save AI Notes and Suggested Questions through MCP. They go through the same core code as the app's own AI: the Speaker Mapping gate, the word-for-word quote check against the source, and the same replace rules (only Unreviewed notes and unaccepted suggestions are replaced). They arrive Unreviewed and are marked as coming from the AI client. Saving is off until the Interviewer turns it on in AI Settings, and only the web interface can turn it on: the MCP server gets a view of core, `aiClientCore`, that holds every read and only these checked writes, not the switch. Chosen by the owner.

## Why

- Without an API key, the AI client's work was lost when its chat closed. Now it lands where the Interviewer reviews it.
- The "AI cannot invent Evidence" guarantee now covers AI work from both sources, because both pass the same check in core.
- An Interviewer with a Claude subscription and no API key gets the same AI Notes and Suggested Questions as one with a key.

## Considered Options

- **Keep the server read-only (ADR 0002)**: simplest guarantee, but the AI client's work is lost and unchecked.
- **Writes always on**: one step fewer, but an AI client could change the app without the Interviewer having chosen it.
- **A general write tool set** (notes, questions, Candidates): far more surface; the Interviewer's own work must stay theirs.

## Consequences

- "An external client cannot change your data" becomes: unless the Interviewer allows it, the AI client can only read; when allowed, it can only add AI Notes and Suggested Questions that pass core's checks, and replace the Unreviewed or unaccepted ones. Interviewer Notes, Saved Questions, Candidates, CVs, and Transcripts stay read-only for it.
- The switch guards the MCP channel, not the computer: the local web interface has no login (ADR 0001), so a program on the same computer, including an AI client with a shell, could change it there.
- New saves replace Unreviewed notes and unaccepted suggestions whoever wrote them, the app or the client, as regenerating does.
- One call is bounded (40 notes, 25 suggestions, 8 quotes each, 2000 characters per text), so a runaway client cannot flood the Workspace.
- The MCP server needs the full Transcript and CV text to quote from, so `get_transcript` and `get_cv` are added.
- Later (#46, approved by the owner) the AI client may also save a Candidate Brief under the same switch. Unlike AI Notes, it is saved even when a quote is not found: core keeps one brief per Candidate and marks each quote found or not found every time it is read. This replaces ADR 0002's "the Candidate Brief is not stored".
- Later (#47) the MCP server may read whether saving is on, so the `brief` prompt gives only reading steps while it is off. It still cannot turn the switch (decisions 207 and 208).
- ADR 0002 still holds for the two modes; its "MCP is read-only" consequence is replaced by this ADR.

## Note, 2026-11-11: saving is on by default

Chosen by the owner. Saving from the AI client is now on in a new install; the Interviewer can turn it off under "Use with MCP", and that choice is kept. An install from before this change keeps saving off unless the Interviewer had turned it on. Why: an Interviewer who connects an AI client expects its notes to appear in the app and may not notice the switch. What keeps it safe: every saved item is checked quote by quote, arrives Unreviewed and labelled as from the AI application, nothing can be deleted or changed through MCP, and the start key limits saving to chats where the user started Interview Companion. The switch stays visible, to turn saving off. This replaces "Saving is off until the Interviewer turns it on" above (decision 417).
