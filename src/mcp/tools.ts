import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { InvalidInputError, NotFoundError, type ReadOnlyCore } from "../core/index.ts";

// Every tool that is about one Candidate takes their id, as list_candidates gives it.
const candidateId = z.string().min(1).describe("The Candidate's id, as given by list_candidates.");

// Builds the MCP server and its tools. It gets only the read operations of core, so no tool
// can change data. Transport (stdio in server.ts, in-memory in tests) is attached by the caller.
export function createMcpServer(core: ReadOnlyCore): McpServer {
  const server = new McpServer({ name: "interview-companion", version: "0.1.0" });
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "list_candidates",
    { description: "List every Candidate with their role and number of Interviews.", annotations: readOnly },
    () =>
      toolResult(() =>
        core
          .listCandidates()
          .map((candidate) => ({ ...candidate, interviewCount: core.listInterviews(candidate.id).length })),
      ),
  );
  server.registerTool(
    "get_candidate",
    {
      description:
        "Get one Candidate's overview: their CV (file name and page count), their Interviews in order " +
        "with each Transcript's state and whether its Speaker Mapping is confirmed, and how many " +
        "Interviewer Notes and Saved Questions they have.",
      inputSchema: { candidateId },
      annotations: readOnly,
    },
    ({ candidateId }) => toolResult(() => core.getCandidateOverview(candidateId)),
  );
  server.registerTool(
    "get_interviewer_notes",
    {
      description:
        "Get the notes the Interviewer wrote about a Candidate, newest save first. A note may be tagged " +
        "with one Interview. Give interviewId to get only that Interview's notes and the untagged ones. " +
        "An Interviewer Note is the Interviewer's opinion, never Evidence of what the Candidate said.",
      inputSchema: {
        candidateId,
        interviewId: z
          .string()
          .min(1)
          .optional()
          .describe("Optional. An Interview id from get_candidate, to show only that Interview's notes and the untagged ones."),
      },
      annotations: readOnly,
    },
    ({ candidateId, interviewId }) => toolResult(() => core.listInterviewerNotes(candidateId, { interviewId })),
  );
  server.registerTool(
    "get_saved_questions",
    {
      description:
        "Get the Interviewer's own list of questions for a Candidate, in the order the Interviewer arranged them.",
      inputSchema: { candidateId },
      annotations: readOnly,
    },
    ({ candidateId }) => toolResult(() => core.listSavedQuestions(candidateId)),
  );
  return server;
}

// Runs a read and turns it into a tool result: the answer as JSON text, or an error result with
// core's message when core refuses. When something named does not exist, the message also says
// where valid ids come from, so the AI client can correct itself.
function toolResult(read: () => unknown) {
  try {
    return { content: [{ type: "text" as const, text: JSON.stringify(read(), null, 2) }] };
  } catch (error) {
    if (error instanceof NotFoundError) return errorResult(`${error.message} ${idHint}`);
    if (error instanceof InvalidInputError) return errorResult(error.message);
    throw error;
  }
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

const idHint = "Candidate ids come from list_candidates, and Interview ids from get_candidate.";
