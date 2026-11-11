// What connects an AI application to this copy's MCP server, ready to paste: the command that adds
// it to Claude Code for every folder, and the configuration Claude Desktop reads from its config
// file. A data folder other than the default is passed on, so the app and the AI application read
// the same data. Claude Desktop does not always see the terminal's PATH, so its configuration
// names the Node.js that runs this app by its full path. The configuration is on one line, so it
// takes little room in the guide; JSON does not need line breaks.
export function mcpSetup({ serverPath, nodePath, dataDir }: { serverPath: string; nodePath: string; dataDir?: string }): {
  command: string;
  desktopConfig: string;
} {
  const env = dataDir ? ` -e DATA_DIR=${shellQuoted(dataDir)}` : "";
  const server = { command: nodePath, args: [serverPath], ...(dataDir ? { env: { DATA_DIR: dataDir } } : {}) };
  return {
    command: `claude mcp add --scope user interview-companion${env} -- node ${shellQuoted(serverPath)}`,
    desktopConfig: JSON.stringify({ mcpServers: { "interview-companion": server } }),
  };
}

// A path as one shell word: as it is when it has only safe characters, in single quotes otherwise.
function shellQuoted(path: string): string {
  return /^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;
}
