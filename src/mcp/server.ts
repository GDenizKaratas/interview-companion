import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defaultDatabasePath, openCore } from "../core/index.ts";

// The read-only MCP server. It reads the same database as the web app, through core.
// Tools and the Candidate Brief prompt are added in later tickets.
const core = openCore(defaultDatabasePath());
const server = new McpServer({ name: "interview-companion", version: "0.1.0" });

process.on("exit", () => core.close());

await server.connect(new StdioServerTransport());
