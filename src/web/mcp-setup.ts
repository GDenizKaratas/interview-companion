import type { DesktopEntry } from "./claude-desktop.ts";

// What connects an AI application to this copy's MCP server, ready to paste: the commands that add
// it to Claude Code, for the folder the command is run in (Claude Code's local scope, so the tools
// are there only in chats started in a folder kept for interviews) or for every folder, and the configuration Claude Desktop reads from its config
// file. A data folder other than the default is passed on, so the app and the AI application read
// the same data. Claude Desktop does not always see the terminal's PATH, so its configuration
// names the Node.js that runs this app by its full path. The configuration is on one line, so it
// takes little room in the guide; JSON does not need line breaks. Paths in the commands are
// quoted for the system's own command line (`platform`, process.platform by default).
export function mcpSetup({
  serverPath,
  nodePath,
  dataDir,
  platform = process.platform,
}: {
  serverPath: string;
  nodePath: string;
  dataDir?: string;
  platform?: string;
}): {
  command: string;
  commandEveryFolder: string;
  desktopConfig: string;
} {
  const quoted = platform === "win32" ? windowsQuoted : shellQuoted;
  const env = dataDir ? ` -e DATA_DIR=${quoted(dataDir)}` : "";
  const server = desktopEntry({ serverPath, nodePath, dataDir });
  return {
    command: `claude mcp add --scope local interview-companion${env} -- node ${quoted(serverPath)}`,
    commandEveryFolder: `claude mcp add --scope user interview-companion${env} -- node ${quoted(serverPath)}`,
    desktopConfig: JSON.stringify({ mcpServers: { "interview-companion": server } }),
  };
}

// The entry Claude Desktop's configuration holds for this copy's MCP server, also written into
// that file by the one-click connect (claude-desktop.ts).
export function desktopEntry({ serverPath, nodePath, dataDir }: { serverPath: string; nodePath: string; dataDir?: string }): DesktopEntry {
  return { command: nodePath, args: [serverPath], ...(dataDir ? { env: { DATA_DIR: dataDir } } : {}) };
}

// A path as one POSIX shell word: as it is when it has only safe characters, in single quotes otherwise.
function shellQuoted(path: string): string {
  return /^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;
}

// A path as one word for the Windows command line, which cmd.exe and PowerShell both read: as it
// is when it has only safe characters, in double quotes otherwise. Single quotes mean nothing to
// cmd.exe. Inside the quotes a double quote is escaped with a backslash, and backslashes right
// before a double quote or the closing quote are doubled, as Windows programs split arguments.
function windowsQuoted(path: string): string {
  if (/^[\w@+=:,./\\-]+$/.test(path)) return path;
  const escaped = path.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}
