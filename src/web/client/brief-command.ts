// The command an Interviewer pastes into Claude Code to run the MCP server's brief prompt for one
// Candidate. Claude Code names an MCP prompt /mcp__<server>__<prompt>; the server is added as
// "interview-companion" (see docs/mcp.md). The name is kept on one line, because a line break
// would send the command before it is complete.
export const briefCommandName = "/mcp__interview-companion__brief";

export function briefCommand(candidateName: string): string {
  return `${briefCommandName} ${candidateName.trim().split(/\s+/).join(" ")}`;
}
