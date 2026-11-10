import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { candidateBriefPrompt } from "./candidate-brief.ts";
import { evidenceSources, InvalidInputError, NotFoundError, PreconditionError, type AiClientCore } from "../core/index.ts";

// Every tool that is about one Candidate takes their id, as list_candidates gives it.
const candidateId = z.string().min(1).describe("The Candidate's id, as given by list_candidates.");

// Builds the MCP server and its tools. It gets core's read operations and only the two writes
// the AI client may make, which go through the same checks as the app's own AI and are refused
// while the Interviewer has not turned them on. No tool can change anything else. Transport
// (stdio in server.ts, in-memory in tests) is attached by the caller.
export function createMcpServer(core: AiClientCore): McpServer {
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
  server.registerTool(
    "get_ai_notes",
    {
      description:
        "Get the AI Notes of one Interview, newest generation first. Each note is one statement the AI made " +
        "about what the Candidate said, with its Evidence: exact quotes from the Interview's Transcript, by " +
        "segment number. reviewState says where the Interviewer stands: unreviewed, confirmed (the note " +
        "reflects its Evidence, not that the Candidate was right), corrected (the Interviewer rewrote it; " +
        "trust correction over statement, which is the AI's original text), or dismissed (the Interviewer hid " +
        "it; do not use it). stale is true when the Speaker Mapping changed after the note was generated, so " +
        "the note may credit words to the wrong speaker: do not rely on a stale note.",
      inputSchema: {
        interviewId: z.string().min(1).describe("An Interview id, as given by get_candidate."),
      },
      annotations: readOnly,
    },
    ({ interviewId }) => toolResult(() => core.listAiNotes(interviewId)),
  );
  server.registerTool(
    "get_transcript",
    {
      description:
        "Get the whole Transcript of one Interview, segment by segment: its number, the speaker label, the " +
        "speaker's role (candidate, interviewer, or other; null while the Speaker Mapping is not confirmed), " +
        "times when the file had them, and the exact text. Null when the Interview has no Transcript. Use the " +
        "segment numbers and exact text when you save AI Notes or Suggested Questions.",
      inputSchema: { interviewId: z.string().min(1).describe("An Interview id, as given by get_candidate.") },
      annotations: readOnly,
    },
    ({ interviewId }) =>
      toolResult(() => {
        const transcript = core.getTranscript(interviewId);
        if (!transcript) return null;
        const speakers = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker]));
        return {
          interviewId,
          fileName: transcript.fileName,
          speakerMappingConfirmed: transcript.speakerMappingConfirmedAt !== null,
          segments: transcript.segments.map((segment) => {
            const speaker = speakers.get(segment.speakerId)!;
            return {
              number: segment.number,
              speakerLabel: speaker.label,
              role: speaker.role,
              startMs: segment.startMs,
              endMs: segment.endMs,
              text: segment.text,
            };
          }),
        };
      }),
  );
  server.registerTool(
    "get_cv",
    {
      description:
        "Get the text of a Candidate's CV, page by page, exactly as the app stores it. Null when there is no CV. " +
        "Quotes from the CV in Suggested Questions must be copied from this text.",
      inputSchema: { candidateId },
      annotations: readOnly,
    },
    ({ candidateId }) =>
      toolResult(() => {
        core.getCandidateOverview(candidateId);
        const cv = core.getCv(candidateId);
        return cv ? { fileName: cv.fileName, pages: cv.pages.map((page) => ({ number: page.number, text: page.text })) } : null;
      }),
  );
  server.registerTool(
    "save_ai_notes",
    {
      description:
        "Save AI Notes you wrote about one Interview into Interview Companion, so the Interviewer can review " +
        "them in the app. Each note is one short, neutral statement about what the Candidate said, with at least " +
        "one quote copied word for word from a segment whose role is candidate (see get_transcript). The app " +
        "checks every quote: a note with any quote that is not found word for word in a Candidate segment is " +
        "dropped, and the answer says how many. Saved notes are Unreviewed and replace the earlier Unreviewed " +
        "ones; notes the Interviewer reviewed stay. Refused until the Speaker Mapping is confirmed, and while " +
        "saving from the AI client is off in the app's AI Settings.",
      inputSchema: {
        interviewId: z.string().min(1).describe("An Interview id, as given by get_candidate."),
        notes: z
          .array(
            z.object({
              statement: z.string().describe("One short, neutral statement, in the Interviewer's language."),
              evidence: z
                .array(
                  z.object({
                    segmentNumber: z.number().int().positive().describe("The segment's number, from get_transcript."),
                    quote: z.string().describe("Words copied exactly from that segment."),
                  }),
                )
                .min(1),
            }),
          )
          .describe("The notes, in the order to show them."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    ({ interviewId, notes }) => toolResult(() => core.saveAiNotesFromClient(interviewId, notes)),
  );
  server.registerTool(
    "save_suggested_questions",
    {
      description:
        "Save questions you suggest the Interviewer could ask a Candidate, into Interview Companion, as " +
        "Suggested Questions. Each has the question, one short reason, and quotes that back it: copied word for " +
        "word from a CV page (see get_cv) or from a Transcript segment (see get_transcript). A question without " +
        "quotes is saved as a general question. The app checks every quote; a suggestion with a quote that is not " +
        "found, or that comes from a Transcript whose Speaker Mapping is not confirmed, is dropped, and the answer " +
        "says how many. Saving replaces the earlier suggestions that were not accepted. Refused while saving from " +
        "the AI client is off in the app's AI Settings.",
      inputSchema: {
        candidateId,
        suggestions: z
          .array(
            z.object({
              question: z.string().describe("The question, in the Interviewer's language."),
              reason: z.string().describe("One short line on why it is worth asking."),
              evidence: z.array(
                z.discriminatedUnion("source", [
                  z.object({
                    source: z.literal("cv"),
                    page: z.number().int().positive().describe("The CV page number, from get_cv."),
                    quote: z.string().describe("Words copied exactly from that page."),
                  }),
                  z.object({
                    source: z.literal("transcript"),
                    interviewId: z.string().min(1),
                    segmentNumber: z.number().int().positive().describe("The segment's number, from get_transcript."),
                    quote: z.string().describe("Words copied exactly from that segment."),
                  }),
                ]),
              ),
            }),
          )
          .describe("The suggestions, in the order to show them."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    ({ candidateId, suggestions }) => toolResult(() => core.saveSuggestedQuestionsFromClient(candidateId, suggestions)),
  );
  server.registerTool(
    "search_evidence",
    {
      description:
        "Search one Candidate's CV and Transcripts for a word or words, with the same search as the app. " +
        "Each result is Evidence: an exact excerpt, a CV line with its page, or a whole Transcript segment with " +
        "its Interview, segment number, speaker label, and speakerRole from the Speaker Mapping (null while the " +
        "mapping is not confirmed: then no speaker is known to be the Candidate). Each search word matches the " +
        "start of a word, ignoring case by Turkish rules, so \"Redis\" also finds \"Redis'i\" and \"REDİS\". " +
        "highlights give the match's character positions in the excerpt. It is a keyword search: \"caching\" " +
        "does not find \"Redis\", so try other words too. No result means nothing was found in the indexed " +
        "sources, not that the Candidate lacks the skill. With candidateOnly, only segments the Candidate said " +
        "in a confirmed Speaker Mapping are searched; unconfirmedInterviewIds lists the Interviews left out.",
      inputSchema: {
        candidateId,
        query: z.string().describe("The word or words to search for. Several words must appear in this order."),
        sources: z
          .enum(evidenceSources)
          .default("all")
          .describe("Optional. Which sources to search; all by default."),
        candidateOnly: z
          .boolean()
          .default(false)
          .describe("Optional. true keeps only what the Candidate said in a confirmed Speaker Mapping. The CV is always searched."),
      },
      annotations: readOnly,
    },
    ({ candidateId, query, sources, candidateOnly }) =>
      toolResult(() => core.searchEvidence(candidateId, { query, sources, candidateOnly })),
  );
  server.registerPrompt(
    "candidate_brief",
    {
      title: "Candidate Brief",
      description:
        "Write a Candidate Brief: one document about a Candidate in which every statement cites Evidence, " +
        "with no judgments, and the reasons and quotes listed at the end. The brief is not stored in the app.",
      argsSchema: {
        candidate: z.string().min(1).describe("The Candidate's name or id, as list_candidates gives it."),
      },
    },
    ({ candidate }) => ({
      messages: [{ role: "user", content: { type: "text", text: candidateBriefPrompt(candidate) } }],
    }),
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
    if (error instanceof InvalidInputError || error instanceof PreconditionError) return errorResult(error.message);
    throw error;
  }
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

const idHint = "Candidate ids come from list_candidates, and Interview ids from get_candidate.";
