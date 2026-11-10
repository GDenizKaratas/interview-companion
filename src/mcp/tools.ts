import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { briefPrompt } from "./brief-prompt.ts";
import { evidenceSources, InvalidInputError, NotFoundError, PreconditionError, type AiClientCore } from "../core/index.ts";

// Bounds on what the AI client can save in one call, so a runaway client cannot flood the
// Workspace. They are generous for a real Interview.
const limits = { notes: 40, askedQuestions: 60, suggestions: 25, evidence: 8, briefEvidence: 100 };
const textLimits = { long: 2000, brief: 50_000 };

const briefNumber = z.number().int().positive().describe("The number in square brackets in the text, such as 1 for [1].");

// Every tool that is about one Candidate takes their id, as list_candidates gives it.
const candidateId = z.string().min(1).describe("The Candidate's id, as given by list_candidates.");

// Where a quote is from: a CV page or one Transcript segment. Suggested Questions and the
// Candidate Brief cite Evidence in this shape.
const cvQuote = {
  source: z.literal("cv"),
  page: z.number().int().positive().describe("The CV page number, from get_cv."),
  quote: z.string().max(textLimits.long).describe("Words copied exactly from that page."),
};
const transcriptQuote = {
  source: z.literal("transcript"),
  interviewId: z.string().min(1),
  segmentNumber: z.number().int().positive().describe("The segment's number, from get_transcript."),
  quote: z.string().max(textLimits.long).describe("Words copied exactly from that segment."),
};

// Builds the MCP server and its tools. It gets core's read operations and only the writes
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
    "get_asked_questions",
    {
      description:
        "Get the Asked Questions of one Interview: every question the Interviewer asked, in order, each with an " +
        "Answer Summary of what the Candidate said, the Interviewer's segment and quote where it was asked " +
        "(questionEvidence), the Candidate's quotes (answerEvidence), and the Saved Question it matches " +
        "(savedQuestionId). null when they were never looked for. stale is true when the Speaker Mapping changed " +
        "after they were found: do not rely on stale ones.",
      inputSchema: {
        interviewId: z.string().min(1).describe("An Interview id, as given by get_candidate."),
      },
      annotations: readOnly,
    },
    ({ interviewId }) => toolResult(() => core.listAskedQuestions(interviewId)),
  );
  server.registerTool(
    "get_saved_question_checks",
    {
      description:
        "For one Candidate, where each Saved Question stands in each Interview whose Asked Questions were found: " +
        "askedQuestion is the Asked Question it matched, or null when it was not found in that Transcript. A " +
        "Saved Question with no entry for an Interview was not checked there.",
      inputSchema: { candidateId },
      annotations: readOnly,
    },
    ({ candidateId }) => toolResult(() => core.listSavedQuestionChecks(candidateId)),
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
              statement: z.string().max(textLimits.long).describe("One short, neutral statement, in the Interviewer's language."),
              evidence: z
                .array(
                  z.object({
                    segmentNumber: z.number().int().positive().describe("The segment's number, from get_transcript."),
                    quote: z.string().max(textLimits.long).describe("Words copied exactly from that segment."),
                  }),
                )
                .min(1)
                .max(limits.evidence),
            }),
          )
          .max(limits.notes)
          .describe("The notes, in the order to show them."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    ({ interviewId, notes }) => toolResult(() => core.saveAiNotesFromClient(interviewId, notes)),
  );
  server.registerTool(
    "save_asked_questions",
    {
      description:
        "Save the Asked Questions of one Interview into Interview Companion: every question the Interviewer " +
        "asked, in order, with a short, neutral Answer Summary of what the Candidate said. Quote where the " +
        "question was asked, word for word from a segment whose role is interviewer, and the answer, word for " +
        "word from segments whose role is candidate, at or after the question (see get_transcript). Set " +
        "savedQuestionId to the id of the Saved Question it asks (see get_saved_questions), or null. The app " +
        "checks every quote and drops a question that fails, and the answer says how many. Saving replaces the " +
        "Interview's earlier Asked Questions. Refused until the Speaker Mapping is confirmed, and while saving " +
        "from the AI client is off in the app's AI Settings.",
      inputSchema: {
        interviewId: z.string().min(1).describe("An Interview id, as given by get_candidate."),
        askedQuestions: z
          .array(
            z.object({
              question: z.string().max(textLimits.long).describe("The question in a few words, in the Interviewer's language."),
              questionEvidence: z.object({
                segmentNumber: z.number().int().positive().describe("The Interviewer's segment, from get_transcript."),
                quote: z.string().max(textLimits.long).describe("Words copied exactly from that segment."),
              }),
              savedQuestionId: z.string().max(100).nullable().describe("The matching Saved Question's id, or null."),
              answerSummary: z.string().max(textLimits.long).describe("One or two neutral sentences, in the Interviewer's language."),
              answerEvidence: z
                .array(
                  z.object({
                    segmentNumber: z.number().int().positive().describe("A Candidate segment, from get_transcript."),
                    quote: z.string().max(textLimits.long).describe("Words copied exactly from that segment."),
                  }),
                )
                .min(1)
                .max(limits.evidence),
            }),
          )
          .max(limits.askedQuestions)
          .describe("The questions, in the order they were asked."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    ({ interviewId, askedQuestions }) => toolResult(() => core.saveAskedQuestionsFromClient(interviewId, askedQuestions)),
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
              question: z.string().max(textLimits.long).describe("The question, in the Interviewer's language."),
              reason: z.string().max(textLimits.long).describe("One short line on why it is worth asking."),
              evidence: z
                .array(z.discriminatedUnion("source", [z.object(cvQuote), z.object(transcriptQuote)]))
                .max(limits.evidence),
            }),
          )
          .max(limits.suggestions)
          .describe("The suggestions, in the order to show them."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    ({ candidateId, suggestions }) => toolResult(() => core.saveSuggestedQuestionsFromClient(candidateId, suggestions)),
  );
  server.registerTool(
    "save_candidate_brief",
    {
      description:
        "Save the Candidate Brief you wrote into Interview Companion, so the Interviewer can read it in the " +
        "Candidate's Workspace. text is the whole brief in Markdown (headings, lists, and paragraphs). evidence " +
        "has one entry per number in square brackets in the text: the exact quote and where it is from, a CV page " +
        "(see get_cv) or a Transcript segment (see get_transcript). The app does not check your statements, but it " +
        "checks every quote against the CV and Transcripts each time the brief is read, and shows the Interviewer " +
        "which ones are not found word for word. Saving replaces the Candidate's earlier brief. Refused while " +
        "saving from the AI client is off in the app's AI Settings.",
      inputSchema: {
        candidateId,
        text: z.string().max(textLimits.brief).describe("The whole brief, as Markdown, in the Interviewer's language."),
        evidence: z
          .array(
            z.discriminatedUnion("source", [
              z.object({ number: briefNumber, ...cvQuote }),
              z.object({ number: briefNumber, ...transcriptQuote }),
            ]),
          )
          .max(limits.briefEvidence)
          .describe("One entry per Evidence number used in the text."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ candidateId, text, evidence }) => toolResult(() => core.saveCandidateBriefFromClient(candidateId, { text, evidence })),
  );
  server.registerTool(
    "get_candidate_brief",
    {
      description:
        "Get the Candidate Brief saved for a Candidate by an AI client, or null when there is none. Each Evidence " +
        "entry has found: whether its quote is, word for word, in that CV page or Transcript segment now.",
      inputSchema: { candidateId },
      annotations: readOnly,
    },
    ({ candidateId }) => toolResult(() => core.getCandidateBrief(candidateId)),
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
    "brief",
    {
      title: "Brief",
      description:
        "Prepare one Candidate: when saving from the AI client is on, write and save AI Notes, Asked Questions, " +
        "and Suggested Questions, then write a Candidate Brief and save it in the app. When saving is off, only read and write " +
        "the brief in the chat. In the brief every statement cites Evidence, with no judgments, and the reasons " +
        "and quotes are listed at the end.",
      argsSchema: {
        candidate: z.string().min(1).describe("The Candidate's name or id, as list_candidates gives it."),
      },
    },
    // Whether saving is on is read each time the prompt is fetched, so the steps match the app now.
    ({ candidate }) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: briefPrompt(candidate, { canSave: core.aiClientWritesAllowed() }) },
        },
      ],
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
