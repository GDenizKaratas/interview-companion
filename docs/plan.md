# Implementation plan

Each milestone is small, can be tested on its own, and ends with a review before the next one starts. Only fictional data is used throughout.

| Milestone | Status |
|---|---|
| 0. Product and architecture | In review |
| 1. Workspace and notes | Not started |
| 2. Evidence: CV, Transcript, search | Not started |
| 3. MCP server | Not started |
| 4. In-app AI | Not started |
| 5. Reliability and documentation | Not started |

## Milestone 0 — Product and architecture

**Goal.** Agree on what we build before writing code.

**Output.** [GLOSSARY.md](../GLOSSARY.md), [decision log](decisions.md), [architecture](architecture.md), [Workspace wireframe](workspace-wireframe.md), this plan.

**Done when.** The documents are reviewed and accepted.

## Milestone 1 — Workspace and notes

**Goal.** A working Workspace that is useful with no AI and no imports.

**Scope.**
- Project setup: `core`, `web`, `mcp` folders, SQLite, tests, one start command.
- Create, list, and delete Candidates. Create Interviews.
- The Workspace with all panels in place and their empty states.
- Interviewer Notes: add, edit, delete, multi-line paste, optional Interview tag.
- Saved Questions written by hand: add, edit, delete, reorder.
- English and Turkish interface with a switch.
- A command that loads a fictional demo Candidate.

**Done when.**
- A new user can start the app with one command and see the demo Candidate.
- Notes and questions survive a restart.
- Deleting a Candidate removes all of their data.
- Tests cover the core operations.

## Milestone 2 — Evidence: CV, Transcript, search

**Goal.** Bring in sources and find exact excerpts in them, with speakers handled safely.

**Scope.**
- CV import (PDF with text), page-by-page text, in-app PDF view.
- Transcript import through adapters: WebVTT and plain `Speaker: text`.
- Research the real Google Meet transcript format and decide if it needs its own adapter.
- Speaker Mapping: assign roles, confirm, edit.
- Search across CV and Transcripts, aware of Turkish letters and suffixes.
- Clicking a result opens its place in the source.

**Done when.**
- A fictional Turkish CV and Transcript import correctly.
- A missing timestamp is shown as missing, not as 00:00.
- Test: the Interviewer says "Redis", the Candidate does not. A search limited to the Candidate returns nothing.
- Test: a search for a term that is absent says nothing was found.
- Test: searching "Redis" also finds "Redis'i" and "REDİS".

## Milestone 3 — MCP server

**Goal.** Let an AI client read the same data through the same core.

**Scope.**
- A stdio MCP server with the six read-only tools and the `candidate_brief` prompt listed in [architecture](architecture.md).
- Input validation on every tool.
- Setup instructions for Claude Desktop and Claude Code.
- A written explanation: what MCP is, what a tool and a prompt are, how a client finds and calls them, and what a plain API would do instead.

**Done when.**
- From Claude Code, "What did the candidate say about Redis?" returns the right excerpts from the demo data.
- The Candidate Brief prompt produces a brief with reasons and quotes at the end.
- Tests call each tool directly and check the result.
- The server offers no way to change data.

## Milestone 4 — In-app AI

**Goal.** AI Notes and Suggested Questions inside the app, with every quote checked.

**Scope.**
- API key setting, with a clear notice of what is sent to the model.
- One provider (Claude) behind a narrow interface.
- AI Note generation, quote check, Review States, Stale flag.
- Suggested Questions on request, with reason and Evidence; accept, edit, dismiss, regenerate, focus.
- The two "no API key" empty states.

**Done when.**
- Test: a note whose quote is not in the source is rejected.
- Test: generation is refused before the Speaker Mapping is confirmed.
- Test: changing the mapping marks notes Stale.
- Test: regenerating suggestions leaves Saved Questions unchanged.
- Test: no model call happens without an explicit request.
- A small evaluation run against the real model on fictional data, with results reported as measured.

## Milestone 5 — Reliability and documentation

**Goal.** Make the project easy to trust, run, and read.

**Scope.**
- Review of error states and data integrity.
- README with real screenshots, setup, demo walkthrough, "Why MCP?", trust and safety, limitations, roadmap.
- A "before you use real data" section on privacy and consent.
- Contribution notes and MIT license.

**Done when.**
- Someone new can follow the README from clone to demo without help.
- Every claim in the README matches what the code does.

## After the MVP

In rough order. These are options, not promises.

1. A second model provider (Gemini).
2. MCP write tools: add an Interviewer Note, save a question.
3. Side-by-side view of what several Candidates said on one topic, with no ranking.
4. Provider integrations for transcripts (Google Meet, Zoom, Teams).
5. Semantic search.
6. A "first impression" note type captured right after an interview.
