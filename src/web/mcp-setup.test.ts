import { describe, expect, it } from "vitest";
import { mcpSetup } from "./mcp-setup.ts";

describe("The setup that connects an AI application to the MCP server", () => {
  it("gives Claude Code one command for every folder", () => {
    expect(mcpSetup({ serverPath: "/apps/ic/src/mcp/server.ts", nodePath: "/usr/local/bin/node" }).command).toBe(
      "claude mcp add --scope user interview-companion -- node /apps/ic/src/mcp/server.ts",
    );
  });

  it("quotes a path with spaces in the command and passes a data folder on", () => {
    expect(mcpSetup({ serverPath: "/My Apps/ic/server.ts", nodePath: "/usr/bin/node", dataDir: "/data dir" }).command).toBe(
      "claude mcp add --scope user interview-companion -e DATA_DIR='/data dir' -- node '/My Apps/ic/server.ts'",
    );
  });

  it("gives Claude Desktop its configuration, with the full path of Node.js it may not find on its own", () => {
    const config = JSON.parse(mcpSetup({ serverPath: "/apps/ic/src/mcp/server.ts", nodePath: "/usr/local/bin/node" }).desktopConfig);
    expect(config).toEqual({
      mcpServers: { "interview-companion": { command: "/usr/local/bin/node", args: ["/apps/ic/src/mcp/server.ts"] } },
    });
  });

  it("passes a data folder to Claude Desktop too, so both read the same data", () => {
    const config = JSON.parse(mcpSetup({ serverPath: "/My Apps/server.ts", nodePath: "C:\\node\\node.exe", dataDir: "/data dir" }).desktopConfig);
    expect(config.mcpServers["interview-companion"]).toEqual({
      command: "C:\\node\\node.exe",
      args: ["/My Apps/server.ts"],
      env: { DATA_DIR: "/data dir" },
    });
  });
});
