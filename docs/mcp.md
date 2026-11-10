# The MCP server

Interview Companion has a read-only MCP server. With it, an AI client such as Claude Code or Claude Desktop can read your Candidates, Interviewer Notes, and Saved Questions and help you prepare, without an API key for Interview Companion.

Terms in capitals are defined in [GLOSSARY.md](../GLOSSARY.md).

## What MCP is

The Model Context Protocol (MCP) is an open standard for connecting an AI client to a program that has data or can do work. The program is the **MCP server**. The AI application, such as Claude Code, is the **MCP client**.

Without MCP, every AI application would need its own plug-in for every program. With MCP, a program describes what it offers once, in a standard way, and any MCP client can use it.

Client and server exchange JSON-RPC messages. Interview Companion uses the **stdio** transport: the client starts the server as a child process and the two talk through its standard input and output. There is no network port and no login, because only the client that started the process can talk to it.

## What a tool is

A **tool** is one operation the server offers. It has:

- a **name**, such as `get_candidate`;
- a **description** in plain words, which the model reads to decide when the tool is useful;
- an **input schema** (JSON Schema) that says which arguments it takes, such as `candidateId`;
- optional **annotations**, such as `readOnlyHint: true`, which tell the client that the tool changes nothing.

The server checks every call against the input schema before it runs the tool. A call with a missing or wrong argument gets an error back, not a guess.

## How a client finds and calls tools

1. **Start.** The client starts the server with the command in its configuration, for example `node src/mcp/server.ts`.
2. **Handshake.** The client sends `initialize`. The server answers with its name and its capabilities, here "I have tools".
3. **Discovery.** The client sends `tools/list`. The server answers with every tool's name, description, input schema, and annotations. The client shows these tools to the model.
4. **Call.** When the model decides a tool helps, the client sends `tools/call` with the tool's name and arguments, for example `get_candidate` with `{ "candidateId": "..." }`.
5. **Result.** The server answers with the result as text. Interview Companion returns JSON. If something is wrong, such as an unknown Candidate, the result is marked as an error and its text says what is wrong, so the model can correct itself and try again.

A plain web API could serve the same data, but then each AI application would need code written for that API. With MCP, the client discovers the tools at run time and the model chooses when to call them.

## The tools

All tools only read. The server gets a view of core that holds only the read operations, so no tool can change data, and there is no tool that adds, edits, or deletes anything.

| Tool | Arguments | Returns |
|---|---|---|
| `list_candidates` | none | Every Candidate, newest first, with id, name, role, the time they were added, and their number of Interviews. |
| `get_candidate` | `candidateId` | One Candidate's overview: the CV's file name, upload time, and page count (or `null`); each Interview in order with its number, date, and Planned flag, and its Transcript's file name, format, number of segments, and whether the Speaker Mapping is confirmed (or `null`); and the number of Interviewer Notes and Saved Questions. No full texts. |
| `get_interviewer_notes` | `candidateId`, optional `interviewId` | The Interviewer Notes, newest save first. With `interviewId`, only that Interview's notes and the untagged ones. |
| `get_saved_questions` | `candidateId` | The Saved Questions in the Interviewer's order. |
| `get_ai_notes` | `interviewId` | The Interview's AI Notes, newest generation first. Each has the AI's statement, the Interviewer's correction (or `null`), its Review State, its Stale flag, and its Evidence: exact quotes with the Transcript segment number. Dismissed notes are included, marked `dismissed`. |

Candidate ids come from `list_candidates`; Interview ids come from `get_candidate`. Searching the CV and Transcripts for Evidence and the Candidate Brief prompt come in a later version.

## Setup

You need Node.js 24 or later and a copy of this project with its packages installed (`npm install`). No API key is needed.

In every example, replace `/path/to/interview-companion` with the absolute path of your copy. The server reads the same database as the web app, `data/interview-companion.sqlite` inside the project folder, no matter which folder the client starts it from. To use another folder, set `DATA_DIR`.

### Claude Code in the terminal

```sh
claude mcp add interview-companion -- node /path/to/interview-companion/src/mcp/server.ts
```

This adds the server for the current project folder only. Add `--scope user` to use it in every folder. Then start `claude` and run `/mcp`: `interview-companion` should be listed as connected. Try asking: "List my Candidates from Interview Companion."

To use another data folder:

```sh
claude mcp add interview-companion -e DATA_DIR=/path/to/data -- node /path/to/interview-companion/src/mcp/server.ts
```

### Claude Code in VS Code

The VS Code extension uses the same configuration as Claude Code in the terminal. Run the `claude mcp add` command above once, in VS Code's terminal or any other, then open the Claude Code panel and type `/mcp` to check that `interview-companion` is connected. With the default scope, run the command from the folder you open in VS Code.

### Claude Desktop

1. Open Claude Desktop's settings, go to **Developer**, and choose **Edit Config**. This opens `claude_desktop_config.json` (on macOS in `~/Library/Application Support/Claude/`, on Windows in `%APPDATA%\Claude\`).
2. Add the server:

   ```json
   {
     "mcpServers": {
       "interview-companion": {
         "command": "node",
         "args": ["/path/to/interview-companion/src/mcp/server.ts"]
       }
     }
   }
   ```

3. Quit Claude Desktop completely and start it again. The tools appear under the tools button of the chat box.

Claude Desktop does not always see the `PATH` of your terminal. If the server does not start, replace `"node"` with the full path that `which node` prints (on Windows, `where node`).

## Trying it without an AI client

The MCP Inspector is a small web page for calling an MCP server by hand:

```sh
npx @modelcontextprotocol/inspector node src/mcp/server.ts
```

Run it from the project folder, choose **Connect**, then **Tools**, **List Tools**, and call a tool.
