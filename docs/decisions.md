# Decision log

Every important decision, with its reason, in the order it was made. New entries go at the bottom. Decisions that are hard to reverse also have a longer record in [adr/](adr/).

Terms in capitals are defined in [GLOSSARY.md](../GLOSSARY.md).

## 2026-11-10 — Planning session

| # | Decision | Why | Rejected alternative |
|---|---|---|---|
| 1 | Local, single-user application with no login. | The product is for one Interviewer; local data is easier to protect and explain. | Hosted multi-user app. See [ADR 0001](adr/0001-local-single-user-sqlite.md). |
| 2 | A Candidate has many Interviews from day one. The screen is still one Workspace per Candidate. | Follow-up questions for a second interview need earlier Interviews. Adding this later would change every source reference. | One Interview per Candidate, multiple rounds later. |
| 3 | Evidence is only an exact excerpt from a CV or Transcript. | An Interviewer Note is the Interviewer's view, not the Candidate's words. | Treating notes as Evidence. See [ADR 0003](adr/0003-evidence-is-only-cv-and-transcript.md). |
| 4 | Two AI modes: in-app AI with an API key, or a Candidate Brief through MCP without one. | The project stays useful without a key, and MCP does real work. | In-app only; MCP only; MCP write-back. See [ADR 0002](adr/0002-two-ai-modes.md). |
| 5 | An AI Note is one statement plus at least one quote. Code rejects the note if the quote is not in the source word for word. | A check in code can be tested; a prompt instruction cannot be trusted alone. | Free-text AI summary. |
| 6 | Every AI suggestion shows a one-line reason. The quote opens on hover or one click. | The Interviewer should see why without extra reading. | Reason hidden in a separate page. |
| 7 | Transcript formats in the MVP: WebVTT and plain `Speaker: text`. | VTT covers Zoom and Teams and has timestamps. Plain text covers pasted transcripts and tests the "no timestamp" case. | Building provider integrations now. |
| 8 | CV format in the MVP: PDF with real text. A CV reference is page number plus exact quote. | Page numbers are reliable in PDFs; section names are not. | DOCX, scanned PDFs with OCR. |
| 9 | Search is keyword-based (full-text) and must handle Turkish letters and suffixes. | The data per Candidate is small, and "no match found" is a clear, explainable answer. The first real user interviews in Turkish. | Embedding-based semantic search (roadmap). |
| 10 | TypeScript for the whole project. | One language lets the web app and the MCP server share the same core. The official MCP SDK is mature in TypeScript. | Separate languages per part. |
| 11 | One SQLite file for all data; uploaded CV files in a folder next to it. | No install step, built-in full-text search, simple backup and deletion. | Postgres. |
| 12 | A local web server started with one command, used in the browser. | No packaging work; setup stays two lines. | Electron desktop app. |
| 13 | MCP server uses stdio. Tested with Claude Desktop and Claude Code. | The client starts the server itself; no port, no authentication. | HTTP transport (roadmap). |
| 14 | Interviewer Notes and questions belong to the Candidate, with an optional Interview tag. | Preparation notes exist before any Interview. | Notes owned by an Interview. |
| 15 | Interviewer Notes are short entries. The box accepts multi-line paste, and the Interview tag can be set by hand. The stored time is when the note was saved. | Some Interviewers write on paper and type notes in later, so the saved time is not the moment in the interview. | One long text; linking notes to the Transcript by time. |
| 16 | Speaker Mapping is confirmed by the Interviewer before AI Notes can be generated. Changing it marks AI Notes Stale. | Crediting the Interviewer's words to the Candidate is the worst failure. | Guessing roles. See [ADR 0004](adr/0004-speaker-mapping-gate.md). |
| 17 | In-app AI supports one provider (Claude) behind a narrow interface. Gemini is the first item after the MVP. | Each provider behaves differently; supporting two from the start doubles the reliability tests. | Several providers in the MVP. |
| 18 | AI reads Interviewer Notes only for Suggested Questions, never for AI Notes. The interface says when notes are sent to the model. | Notes are the best input for follow-up questions, but AI Notes describe what the Candidate said. | AI never reads notes; AI reads notes everywhere. |
| 19 | Comparing Candidates is out of the MVP. | It is the feature closest to ranking, and the single-Candidate flow must be solid first. | A comparison page now. |
| 20 | Build order: Workspace and notes, then Evidence, then MCP, then in-app AI, then reliability and docs. | MCP needs no model integration, so a useful version exists earlier. Order is not priority: in-app AI is still part of the MVP. | In-app AI before MCP. |
| 21 | The MCP server is read-only in the MVP. | "An external client cannot change your data" is a guarantee one sentence can state. | Write tools now (roadmap). |
| 22 | Review States: Unreviewed, Confirmed, Corrected, Dismissed. Stale is a separate flag. | "Needs correction" is a task, not an outcome. Corrected keeps the original AI text. | Unreviewed / Reviewed / Needs correction. |
| 23 | Suggested Question and Saved Question are separate. Accepting copies the suggestion. | Regenerating can then never touch saved questions, by construction. | One question record with a status. |
| 24 | Suggested Questions stay collapsed and are generated only on request. | The Interviewer may not want them, and unrequested generation wastes tokens. | Suggestions shown by default. |
| 25 | The interface supports English and Turkish and can switch. English is the default. All text lives in translation files. | The first users are Turkish; the repository is public and in English. | English only. |
| 26 | AI output is written in the interface language. Quotes stay in the source language, unchanged. | A translated quote would fail the exact-match check. | Translating quotes. |
| 27 | Stack: one TypeScript project with `core`, `web`, and `mcp` folders; React and Vite; Hono; SQLite; pdf.js; Vitest; the official MCP SDK. | Light, common, one command to run. `web` and `mcp` may only call `core`, so business rules exist once. | Next.js; a multi-package monorepo. |
| 28 | Development and tests use only fictional data. Deleting a Candidate deletes everything about them, including the CV file. License: MIT. | Real candidate data must never reach the public repository. | — |
| 29 | No fixed deadline. Milestones are reviewed one at a time. | Understanding each step matters more than speed. | Cutting scope to ship in one day. |
| 30 | Tests go through core's public interface with a real temporary SQLite file. AI tests use a fake provider. MCP gets a thin test through an in-memory client. The interface has no automated tests in the MVP. | Rules live in core, so testing there covers them once. A fake provider makes AI tests repeatable and free. | Database mocks; browser tests. |
| 31 | The repository starts private and becomes public once a working version exists. | Private to public is one step; the reverse cannot be undone. | Public from the first commit. |
| 32 | The full MVP spec is tracked as a GitHub issue and will be split into one issue per milestone. | One place for the agreed scope; small issues for the actual work. | Spec only as a file in the repository. |
| 33 | Each ticket is built on its own branch in its own worktree and reaches `main` as one squash-merged pull request, only after the owner approves. | Work branches can hold any number of commits; `main` stays clean and fully reviewed. | Direct commits to `main`. |
| 34 | Work runs in two parallel lanes (two chats): one for tickets where learning matters, one for mechanical tickets. | The owner's review time is the bottleneck, and early tickets touch shared files, so more lanes would add conflicts and waiting, not speed. | One lane; four lanes. |
| 35 | Every ticket is built test-first and reviewed with the code-review skill before it is shown to the owner. | The owner reviews a finished, tested change, not a draft. | Review only at milestone end. |

## 2026-11-10 — #2 Project skeleton and first Candidate

| # | Decision | Why | Rejected alternative |
|---|---|---|---|
| 36 | SQLite through Node's built-in `node:sqlite` module. Node 24 or newer is required. | No native build step on install, and its bundled SQLite includes the FTS5 full-text search we need later. | `better-sqlite3`, which compiles native code and often lags behind new Node versions. |
| 37 | Node runs the TypeScript files directly (built-in type stripping). `tsc` only checks types. Code uses only erasable TypeScript syntax. | No build step for the server or the MCP server, and one less tool to explain. | `tsx` or compiling to `dist/` before running. |
| 38 | TypeScript 6.0, not 7.0. | `typescript-eslint` does not support 7.0 yet. | TypeScript 7.0 without type-aware linting. |
| 39 | The schema is upgraded by an ordered list of SQL steps in core, with the applied count stored in `PRAGMA user_version`. | Simple, has no dependency, and runs every time the database opens. | A migration library. |
| 40 | The database lives at `data/interview-companion.sqlite` in the project folder, or in `DATA_DIR` when set. Core decides the path, so web and mcp always open the same file. | An MCP client starts the server from any directory, so the path cannot depend on the current directory. | A path relative to the current directory. |
| 41 | The local server listens on 127.0.0.1 only. `npm start` builds the interface and starts the server on port 3000 (`PORT` overrides it). | The app holds candidate data and is for this machine only. | Listening on all network interfaces. |
| 42 | The Candidate list shows the newest Candidate first. A Candidate needs a name and a role; spaces around them are removed. | The Interviewer usually works on the Candidate they added most recently. | Alphabetical order. |
| 43 | A lint rule enforces the module boundary: `web` and `mcp` import core only through `src/core/index.ts`, and the browser code never imports core. | The rule "no business rule is written twice" is checked by a tool, not only by review. | Relying on code review alone. |
| 44 | Workspace panels show only their empty-state message for now. Upload, import, and input controls arrive with the tickets that make them work. | A button that does nothing is misleading. | Disabled placeholder buttons. |
| 45 | Candidate ids are random UUIDs stored as text. Times are stored as ISO 8601 text in UTC. | Ids do not reveal how many Candidates exist or in what order, and ISO text sorts correctly and reads clearly in the database. | Auto-increment integer ids; Unix timestamps. |
| 46 | The browser interface uses a small hand-written router with two pages: the Candidate list and the Workspace. | Two routes do not justify a dependency. | A routing library such as React Router. |
| 47 | The browser imports only types from core (`import type` from `src/core/index.ts`). The lint rule allows nothing else. | One definition of each shape, with no core code in the browser bundle. | A second copy of each type in the browser code. |
| 48 | Until #3 adds translation files, all interface text lives in one file, `src/web/client/text.ts`. | #3 then only has to turn one file into translation files. | Text written directly in components. |
| 49 | `npm start` prints the address; it does not open a browser by itself. | Opening a browser differs per operating system and is unwanted when the app is restarted often. To be confirmed by the owner. | Opening the default browser automatically. |
| 50 | The browser form does not check required fields itself. Core's message is shown instead. | The rule "a Candidate needs a name and a role" stays in one place. | The HTML `required` attribute as a second copy of the rule. |
| 51 | Roles stay free text, but the role box suggests every role used before. A role that differs from an existing one only in letter case or spaces is saved under the existing spelling. Two roles count as the same if they are equal under English or Turkish case rules; the machine's default language is never used. | Prevents near-duplicate roles such as "backend engineer" next to "Backend Engineer" without a separate role list to manage. Capital I lowers to i in English but to ı in Turkish, and the default language differs between machines. | A fixed role list managed separately; comparing with the machine's default language. |

## Open questions

- The exact format of Google Meet transcripts. To be researched at the start of Milestone 2.
- GLOSSARY lists "My note" and "personal note" as terms to avoid, but the wireframe titles the panel "My Notes" with the empty state "No personal notes yet." The code uses the wireframe text for now, under the identifier `interviewerNotes`.
