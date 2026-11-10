import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defaultDatabasePath, openCore, readOnlyCore } from "../core/index.ts";
import { createMcpServer } from "./tools.ts";

// The read-only MCP server over stdio. An AI client starts this process and talks to it through
// standard input and output, so nothing else may be written to stdout. It reads the same
// database as the web app, through core's read-only view.
const core = openCore(defaultDatabasePath());
process.on("exit", () => core.close());

await createMcpServer(readOnlyCore(core)).connect(new StdioServerTransport());
