import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { aiClientCore, defaultDatabasePath, openCore } from "../core/index.ts";
import { createMcpServer } from "./tools.ts";

// The MCP server over stdio. An AI client starts this process and talks to it through standard
// input and output, so nothing else may be written to stdout. It uses the same database as the
// web app, through core's view for the AI client: every read, and only the checked writes.
const core = openCore(defaultDatabasePath());
process.on("exit", () => core.close());

await createMcpServer(aiClientCore(core)).connect(new StdioServerTransport());
