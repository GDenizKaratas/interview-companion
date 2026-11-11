import { describe, expect, it } from "vitest";
import { mcpSetup } from "./mcp-setup.ts";

describe("The setup that connects an AI application to the MCP server", () => {
  it("gives Claude Code a command for the folder it is run in, and one for every folder", () => {
    const setup = mcpSetup({ serverPath: "/apps/ic/src/mcp/server.ts", nodePath: "/usr/local/bin/node" });
    expect(setup.command).toBe("claude mcp add --scope local interview-companion -- node /apps/ic/src/mcp/server.ts");
    expect(setup.commandEveryFolder).toBe("claude mcp add --scope user interview-companion -- node /apps/ic/src/mcp/server.ts");
  });

  it("quotes a path with spaces in the command and passes a data folder on", () => {
    expect(mcpSetup({ serverPath: "/My Apps/ic/server.ts", nodePath: "/usr/bin/node", dataDir: "/data dir" }).command).toBe(
      "claude mcp add --scope local interview-companion -e DATA_DIR='/data dir' -- node '/My Apps/ic/server.ts'",
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

  it("quotes paths for the Windows command line with double quotes, as cmd.exe and PowerShell read them", () => {
    const setup = mcpSetup({
      serverPath: "C:\\Users\\Ayşe Yılmaz\\interview-companion\\src\\mcp\\server.ts",
      nodePath: "C:\\Program Files\\nodejs\\node.exe",
      dataDir: "D:\\Görüşme verisi",
      platform: "win32",
    });
    expect(setup.command).toBe(
      'claude mcp add --scope local interview-companion -e DATA_DIR="D:\\Görüşme verisi" -- node "C:\\Users\\Ayşe Yılmaz\\interview-companion\\src\\mcp\\server.ts"',
    );
    expect(setup.commandEveryFolder).toContain('-- node "C:\\Users\\Ayşe Yılmaz\\interview-companion\\src\\mcp\\server.ts"');
  });

  it("leaves a plain Windows path unquoted, and escapes a double quote and the backslashes before it", () => {
    expect(mcpSetup({ serverPath: "C:\\ic\\server.ts", nodePath: "node", platform: "win32" }).command).toBe(
      "claude mcp add --scope local interview-companion -- node C:\\ic\\server.ts",
    );
    expect(mcpSetup({ serverPath: 'C:\\a "b"\\', nodePath: "node", platform: "win32" }).command).toBe(
      'claude mcp add --scope local interview-companion -- node "C:\\a \\"b\\"\\\\"',
    );
  });

  it("keeps POSIX single quotes on macOS and Linux", () => {
    expect(mcpSetup({ serverPath: "/Users/Ayşe/it's/server.ts", nodePath: "/usr/bin/node", platform: "linux" }).command).toBe(
      "claude mcp add --scope local interview-companion -- node '/Users/Ayşe/it'\\''s/server.ts'",
    );
  });

  it("writes Windows paths into Claude Desktop's configuration as valid JSON that reads back the same", () => {
    const serverPath = "C:\\Users\\Ayşe Yılmaz\\interview-companion\\src\\mcp\\server.ts";
    const desktopConfig = mcpSetup({ serverPath, nodePath: "C:\\Program Files\\nodejs\\node.exe", platform: "win32" }).desktopConfig;
    expect(desktopConfig).toContain('"C:\\\\Users\\\\Ayşe Yılmaz');
    expect(JSON.parse(desktopConfig).mcpServers["interview-companion"]).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: [serverPath],
    });
  });
});
