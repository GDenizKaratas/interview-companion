import { chmodSync, copyFileSync, existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, posix, win32 } from "node:path";
import { isDeepStrictEqual } from "node:util";

// Connecting Claude Desktop with one click: this copy's MCP server is written into Claude
// Desktop's own configuration file, which Claude Desktop reads when it starts. This is another
// application's file, so it is written only when the Interviewer clicks, and carefully: every other
// server and setting is kept, a file that cannot be read is left alone, the earlier file is kept
// beside it as a copy, and the new one replaces it in one step. Claude Desktop still has to be
// restarted; nothing here can do that.

export const serverName = "interview-companion";

// What an entry in Claude Desktop's `mcpServers` holds, as mcpSetup builds it.
export type DesktopEntry = { command: string; args: string[]; env?: Record<string, string> };

// unsupported: the place of the file is not known on this system. notInstalled: the Claude folder
// is not there. unreadable: the file is not a JSON object with an object of servers.
// otherCopy: an entry with this name points to another copy or another data folder.
export type ClaudeDesktopState = "unsupported" | "notInstalled" | "unreadable" | "notConnected" | "connected" | "otherCopy";

export class ClaudeDesktopRefusal extends Error {
  readonly reason: "unsupported" | "notInstalled" | "unreadable";

  constructor(reason: "unsupported" | "notInstalled" | "unreadable") {
    super(`Claude Desktop's configuration was not changed: ${reason}.`);
    this.reason = reason;
  }
}

const backupSuffix = ".interview-companion-backup";
const temporarySuffix = ".interview-companion-tmp";

// The file's place, from Claude Desktop's documentation for macOS and Windows. Other systems are
// not confirmed, so the app does not guess there.
export function claudeDesktopConfigPath({ platform, home, appData }: { platform: string; home: string; appData?: string }): string | null {
  if (platform === "darwin") return posix.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32" && appData) return win32.join(appData, "Claude", "claude_desktop_config.json");
  return null;
}

export function claudeDesktopState(configPath: string | null, entry: DesktopEntry): ClaudeDesktopState {
  const read = readConfig(configPath);
  if (typeof read === "string") return read;
  const current = read.servers[serverName];
  if (current === undefined) return "notConnected";
  return isDeepStrictEqual(current, entry) ? "connected" : "otherCopy";
}

// Adds or replaces this copy's entry and says which; refuses, changing nothing, when the file's
// place is not known, Claude Desktop is not installed, or the file cannot be read.
export function connectClaudeDesktop(configPath: string | null, entry: DesktopEntry): "added" | "updated" | "unchanged" {
  const read = readConfig(configPath);
  if (typeof read === "string") throw new ClaudeDesktopRefusal(read);
  const path = configPath!;
  const current = read.servers[serverName];
  if (isDeepStrictEqual(current, entry)) return "unchanged";

  const next = { ...read.config, mcpServers: { ...read.servers, [serverName]: entry } };
  if (read.exists) copyFileSync(path, path + backupSuffix);
  const temporary = path + temporarySuffix;
  // The file can hold other servers' secrets: it keeps its permissions, and a new one is the owner's only.
  const mode = read.exists ? statSync(path).mode & 0o777 : 0o600;
  try {
    rmSync(temporary, { force: true });
    writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode });
    chmodSync(temporary, mode);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  return current === undefined ? "added" : "updated";
}

type ReadConfig = { exists: boolean; config: Record<string, unknown>; servers: Record<string, unknown> };

function readConfig(configPath: string | null): ReadConfig | "unsupported" | "notInstalled" | "unreadable" {
  if (!configPath) return "unsupported";
  if (!existsSync(dirname(configPath))) return "notInstalled";
  if (!existsSync(configPath)) return { exists: false, config: {}, servers: {} };
  const text = readFileSync(configPath, "utf8");
  // An empty file holds nothing to keep.
  if (text.trim() === "") return { exists: true, config: {}, servers: {} };
  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch {
    return "unreadable";
  }
  if (!isObject(config)) return "unreadable";
  const servers = config.mcpServers ?? {};
  if (!isObject(servers)) return "unreadable";
  return { exists: true, config, servers };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
