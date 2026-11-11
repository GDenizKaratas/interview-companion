import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeDesktopConfigPath, claudeDesktopState, connectClaudeDesktop, ClaudeDesktopRefusal } from "./claude-desktop.ts";

// Every test works in its own temporary folder; the real home folder is never touched.
let dir: string;
let claudeDir: string;
let configPath: string;
const entry = { command: "/usr/local/bin/node", args: ["/apps/ic/src/mcp/server.ts"] };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "claude-desktop-"));
  claudeDir = join(dir, "Claude");
  configPath = join(claudeDir, "claude_desktop_config.json");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function writeConfig(value: unknown) {
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(configPath, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function readConfig(): unknown {
  return JSON.parse(readFileSync(configPath, "utf8"));
}

describe("Where Claude Desktop keeps its configuration", () => {
  it("is under Application Support on macOS and under APPDATA on Windows", () => {
    expect(claudeDesktopConfigPath({ platform: "darwin", home: "/Users/ayse" })).toBe(
      "/Users/ayse/Library/Application Support/Claude/claude_desktop_config.json",
    );
    expect(claudeDesktopConfigPath({ platform: "win32", home: "C:\\Users\\ayse", appData: "C:\\Users\\ayse\\AppData\\Roaming" })).toBe(
      "C:\\Users\\ayse\\AppData\\Roaming\\Claude\\claude_desktop_config.json",
    );
  });

  it("is not known on other systems, or on Windows without APPDATA", () => {
    expect(claudeDesktopConfigPath({ platform: "linux", home: "/home/ayse" })).toBeNull();
    expect(claudeDesktopConfigPath({ platform: "win32", home: "C:\\Users\\ayse" })).toBeNull();
  });
});

describe("Connecting Claude Desktop with one click", () => {
  it("refuses and creates nothing when Claude Desktop is not installed", () => {
    expect(claudeDesktopState(configPath, entry)).toBe("notInstalled");
    expect(() => connectClaudeDesktop(configPath, entry)).toThrow(ClaudeDesktopRefusal);
    expect(existsSync(claudeDir)).toBe(false);
  });

  it("refuses on a system whose configuration place is not known", () => {
    expect(claudeDesktopState(null, entry)).toBe("unsupported");
    expect(() => connectClaudeDesktop(null, entry)).toThrow(expect.objectContaining({ reason: "unsupported" }));
  });

  it("creates the file when the folder is there but the file is not", () => {
    mkdirSync(claudeDir);
    expect(claudeDesktopState(configPath, entry)).toBe("notConnected");

    expect(connectClaudeDesktop(configPath, entry)).toBe("added");

    expect(readConfig()).toEqual({ mcpServers: { "interview-companion": entry } });
    expect(claudeDesktopState(configPath, entry)).toBe("connected");
  });

  it("keeps every other server and every other key exactly, and saves a copy of the file first", () => {
    const before = {
      globalShortcut: "Alt+Space",
      preferences: { theme: "dark" },
      mcpServers: { files: { command: "npx", args: ["-y", "files-server", "/Users/ayse"], env: { A: "1" } } },
    };
    writeConfig(before);
    const original = readFileSync(configPath, "utf8");

    expect(connectClaudeDesktop(configPath, entry)).toBe("added");

    expect(readConfig()).toEqual({ ...before, mcpServers: { ...before.mcpServers, "interview-companion": entry } });
    expect(readFileSync(join(claudeDir, "claude_desktop_config.json.interview-companion-backup"), "utf8")).toBe(original);
  });

  it("adds the servers list to a file without one", () => {
    writeConfig({ preferences: { theme: "dark" } });

    connectClaudeDesktop(configPath, entry);

    expect(readConfig()).toEqual({ preferences: { theme: "dark" }, mcpServers: { "interview-companion": entry } });
  });

  it("refuses a file that is not valid JSON and changes nothing", () => {
    writeConfig('{ "mcpServers": { ');

    expect(claudeDesktopState(configPath, entry)).toBe("unreadable");
    expect(() => connectClaudeDesktop(configPath, entry)).toThrow(expect.objectContaining({ reason: "unreadable" }));
    expect(readFileSync(configPath, "utf8")).toBe('{ "mcpServers": { ');
    expect(readdirSync(claudeDir)).toEqual(["claude_desktop_config.json"]);
  });

  it("treats an empty file as an empty configuration", () => {
    writeConfig("  \n");

    expect(connectClaudeDesktop(configPath, entry)).toBe("added");
    expect(readConfig()).toEqual({ mcpServers: { "interview-companion": entry } });
  });

  it("refuses a file whose servers list is not an object", () => {
    writeConfig({ mcpServers: [] });

    expect(() => connectClaudeDesktop(configPath, entry)).toThrow(expect.objectContaining({ reason: "unreadable" }));
    expect(readConfig()).toEqual({ mcpServers: [] });
  });

  it("changes nothing when the same entry is already there", () => {
    writeConfig({ mcpServers: { "interview-companion": entry } });
    const original = readFileSync(configPath, "utf8");

    expect(connectClaudeDesktop(configPath, entry)).toBe("unchanged");

    expect(readFileSync(configPath, "utf8")).toBe(original);
    expect(readdirSync(claudeDir)).toEqual(["claude_desktop_config.json"]);
  });

  it("tells an entry for another copy apart, and replaces it", () => {
    writeConfig({ mcpServers: { "interview-companion": { command: "node", args: ["/old/ic/src/mcp/server.ts"] } } });
    expect(claudeDesktopState(configPath, entry)).toBe("otherCopy");

    expect(connectClaudeDesktop(configPath, entry)).toBe("updated");

    expect(readConfig()).toEqual({ mcpServers: { "interview-companion": entry } });
    expect(claudeDesktopState(configPath, entry)).toBe("connected");
  });

  it("leaves no temporary file behind", () => {
    writeConfig({});

    connectClaudeDesktop(configPath, entry);
    connectClaudeDesktop(configPath, { ...entry, env: { DATA_DIR: "/data" } });

    expect(readdirSync(claudeDir).sort()).toEqual(["claude_desktop_config.json", "claude_desktop_config.json.interview-companion-backup"]);
  });
});
