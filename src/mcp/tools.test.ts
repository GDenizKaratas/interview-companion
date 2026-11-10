import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiClientCore, openCore, type Candidate, type Core, type ProposedAiNote } from "../core/index.ts";
import { createMcpServer } from "./tools.ts";

let dir: string;
let core: Core;
let client: Client;
let candidate: Candidate;
// What the stand-in model proposes when AI Notes are generated. mcp may use core only through its
// public interface, so this test has its own small fake instead of core's testing helper.
let proposed: ProposedAiNote[];
let clock: Date;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  proposed = [];
  clock = new Date("2026-11-10T09:30:00Z");
  core = openCore(join(dir, "test.sqlite"), { today: () => "2026-11-10", now: () => clock, aiProvider: () => ({ proposeAiNotes: async () => proposed, proposeQuestions: async () => [] }) });
  candidate = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(aiClientCore(core)).connect(serverSide);
  client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientSide);
});

afterEach(async () => {
  await client.close();
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

// Calls a tool and returns its JSON answer. Fails the test if the tool reports an error.
async function call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  expect(result.isError, text).toBeFalsy();
  return JSON.parse(text);
}

// Calls a tool that should refuse, and returns its error message.
async function refusal(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBe(true);
  return (result.content as { type: string; text: string }[])[0]!.text;
}

describe("MCP server", () => {
  it("offers the read tools, and only the two writes that go through core's checks", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_ai_notes",
      "get_candidate",
      "get_cv",
      "get_interviewer_notes",
      "get_saved_questions",
      "get_transcript",
      "list_candidates",
      "save_ai_notes",
      "save_suggested_questions",
      "search_evidence",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(!tool.name.startsWith("save_"));
      expect(tool.description, tool.name).toBeTruthy();
    }
  });

  it("list_candidates gives each Candidate's name, role, and number of Interviews", async () => {
    core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    core.addInterview({ candidateId: candidate.id });
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });

    expect(await call("list_candidates")).toEqual([
      { id: other.id, name: "Can Aksoy", role: "Data Engineer", createdAt: other.createdAt, interviewCount: 0 },
      { id: candidate.id, name: "Ada Demir", role: "Backend Engineer", createdAt: candidate.createdAt, interviewCount: 2 },
    ]);
  });

  it("get_candidate gives one Candidate's overview", async () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    core.addSavedQuestion({ candidateId: candidate.id, text: "How did you make the payment job idempotent?" });

    expect(await call("get_candidate", { candidateId: candidate.id })).toEqual({
      candidate,
      cv: null,
      interviews: [{ ...interview, transcript: null }],
      interviewerNoteCount: 0,
      savedQuestionCount: 1,
    });
  });

  it("get_candidate refuses an unknown Candidate with a clear message and says where ids come from", async () => {
    const message = await refusal("get_candidate", { candidateId: "no-such-candidate" });

    expect(message).toContain("This Candidate does not exist.");
    expect(message).toContain("list_candidates");
  });

  it("every tool about one Candidate refuses a missing, empty, or non-text Candidate id", async () => {
    for (const tool of ["get_candidate", "get_interviewer_notes", "get_saved_questions"]) {
      expect(await refusal(tool, {}), tool).toContain("candidateId");
      expect(await refusal(tool, { candidateId: "" }), tool).toContain("candidateId");
      expect(await refusal(tool, { candidateId: 42 }), tool).toContain("candidateId");
    }
  });

  it("get_interviewer_notes refuses an empty or non-text Interview id", async () => {
    expect(await refusal("get_interviewer_notes", { candidateId: candidate.id, interviewId: "" })).toContain("interviewId");
    expect(await refusal("get_interviewer_notes", { candidateId: candidate.id, interviewId: 7 })).toContain("interviewId");
  });

  it("get_interviewer_notes gives the Candidate's notes, newest save first", async () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const [early] = core.addInterviewerNotes({ candidateId: candidate.id, text: "Strong on SQL" });
    const [tagged] = core.addInterviewerNotes({ candidateId: candidate.id, interviewId: interview.id, text: "Vague on queues" });

    const notes = (await call("get_interviewer_notes", { candidateId: candidate.id })) as { text: string }[];

    expect(notes.map((note) => note.text).sort()).toEqual(["Strong on SQL", "Vague on queues"]);
    expect(notes).toContainEqual(tagged);
    expect(notes).toContainEqual(early);
  });

  it("get_interviewer_notes can show only one Interview's notes and the untagged ones", async () => {
    const first = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const second = core.addInterview({ candidateId: candidate.id, date: "2026-11-05" });
    core.addInterviewerNotes({ candidateId: candidate.id, text: "Untagged" });
    core.addInterviewerNotes({ candidateId: candidate.id, interviewId: first.id, text: "About the first" });
    core.addInterviewerNotes({ candidateId: candidate.id, interviewId: second.id, text: "About the second" });

    const notes = (await call("get_interviewer_notes", { candidateId: candidate.id, interviewId: first.id })) as {
      text: string;
    }[];

    expect(notes.map((note) => note.text).sort()).toEqual(["About the first", "Untagged"]);
  });

  it("get_interviewer_notes refuses an unknown Candidate and an Interview of another Candidate", async () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const othersInterview = core.addInterview({ candidateId: other.id });

    expect(await refusal("get_interviewer_notes", { candidateId: "no-such-candidate" })).toContain(
      "This Candidate does not exist.",
    );
    expect(
      await refusal("get_interviewer_notes", { candidateId: candidate.id, interviewId: othersInterview.id }),
    ).toContain("Interview");
  });

  it("get_saved_questions gives the Candidate's questions in the Interviewer's order", async () => {
    const first = core.addSavedQuestion({ candidateId: candidate.id, text: "Walk me through the payment job." });
    const second = core.addSavedQuestion({ candidateId: candidate.id, text: "How did you make it idempotent?" });
    core.moveSavedQuestion(second.id, 0);

    expect(await call("get_saved_questions", { candidateId: candidate.id })).toEqual([second, first]);
  });

  it("get_saved_questions refuses an unknown Candidate", async () => {
    expect(await refusal("get_saved_questions", { candidateId: "no-such-candidate" })).toContain(
      "This Candidate does not exist.",
    );
  });

  it("get_ai_notes gives an Interview's AI Notes with Review State, Stale flag, and Evidence, Dismissed ones too", async () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const transcript = core.importTranscript(interview.id, {
      fileName: "t.txt",
      bytes: new TextEncoder().encode("Ayşe: Which queue did you use?\nAda: We used Redis with BullMQ."),
    });
    const roles = (interviewer: "interviewer" | "other") =>
      Object.fromEntries(
        transcript.speakers.map((speaker) => [speaker.id, speaker.label === "Ada" ? "candidate" : interviewer] as const),
      );
    core.confirmSpeakerMapping(interview.id, roles("interviewer"));
    core.saveApiKey("sk-ant-test-key");
    proposed = [
      { statement: "Used Redis.", evidence: [{ segmentNumber: 2, quote: "Redis" }] },
      { statement: "Used BullMQ.", evidence: [{ segmentNumber: 2, quote: "BullMQ" }] },
    ];
    const [first, second] = (await core.generateAiNotes(interview.id)).notes;
    core.correctAiNote(first!.id, "Used Redis with BullMQ.");
    core.dismissAiNote(second!.id);
    clock = new Date("2026-11-10T10:00:00Z");
    core.confirmSpeakerMapping(interview.id, roles("other"));

    expect(await call("get_ai_notes", { interviewId: interview.id })).toEqual([
      {
        id: first!.id,
        interviewId: interview.id,
        statement: "Used Redis.",
        correction: "Used Redis with BullMQ.",
        reviewState: "corrected",
        generatedAt: "2026-11-10T09:30:00.000Z",
        source: "app",
        stale: true,
        evidence: [{ segmentNumber: 2, quote: "Redis" }],
      },
      {
        id: second!.id,
        interviewId: interview.id,
        statement: "Used BullMQ.",
        correction: null,
        reviewState: "dismissed",
        generatedAt: "2026-11-10T09:30:00.000Z",
        source: "app",
        stale: true,
        evidence: [{ segmentNumber: 2, quote: "BullMQ" }],
      },
    ]);
  });

  it("get_ai_notes gives nothing for an Interview without AI Notes, and refuses an unknown Interview", async () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });

    expect(await call("get_ai_notes", { interviewId: interview.id })).toEqual([]);
    expect(await refusal("get_ai_notes", { interviewId: "no-such-interview" })).toContain("get_candidate");
    expect(await refusal("get_ai_notes", { interviewId: "" })).toBeTruthy();
  });

  it("search_evidence gives exact excerpts from the Transcripts with their Interview, segment, and speaker", async () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    core.importTranscript(interview.id, {
      fileName: "t.txt",
      bytes: new TextEncoder().encode("Ayşe: Which queue did you use?\nAda: We used Redis'i with BullMQ."),
    });

    expect(await call("search_evidence", { candidateId: candidate.id, query: "redis" })).toEqual({
      results: [
        {
          source: "transcript",
          interviewId: interview.id,
          segmentNumber: 2,
          speakerLabel: "Ada",
          speakerRole: null,
          startMs: null,
          endMs: null,
          excerpt: "We used Redis'i with BullMQ.",
          highlights: [{ start: 8, end: 13 }],
        },
      ],
      foundIn: { cv: false, interviewIds: [interview.id] },
      unconfirmedInterviewIds: [],
    });
  });

  it("search_evidence limited to the Candidate finds nothing when only the Interviewer said the word", async () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const transcript = core.importTranscript(interview.id, {
      fileName: "t.txt",
      bytes: new TextEncoder().encode("Ayşe: Did you use Redis?\nAda: We used a database table."),
    });

    expect(
      await call("search_evidence", { candidateId: candidate.id, query: "Redis", candidateOnly: true }),
    ).toEqual({ results: [], foundIn: { cv: false, interviewIds: [] }, unconfirmedInterviewIds: [interview.id] });

    core.confirmSpeakerMapping(
      interview.id,
      Object.fromEntries(transcript.speakers.map((s) => [s.id, s.label === "Ada" ? "candidate" : "interviewer"] as const)),
    );
    expect(
      await call("search_evidence", { candidateId: candidate.id, query: "Redis", candidateOnly: true, sources: "transcripts" }),
    ).toEqual({ results: [], foundIn: { cv: false, interviewIds: [] }, unconfirmedInterviewIds: [] });
  });

  it("search_evidence limited to the Candidate gives only the Candidate's segments once the mapping is confirmed", async () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const transcript = core.importTranscript(interview.id, {
      fileName: "t.txt",
      bytes: new TextEncoder().encode("Ayşe: Did you use Redis?\nAda: Yes, REDİS for the queue."),
    });
    core.confirmSpeakerMapping(
      interview.id,
      Object.fromEntries(transcript.speakers.map((s) => [s.id, s.label === "Ada" ? "candidate" : "interviewer"] as const)),
    );

    const search = (await call("search_evidence", { candidateId: candidate.id, query: "redis", candidateOnly: true })) as {
      results: { segmentNumber: number; speakerRole: string; excerpt: string }[];
    };

    expect(search.results.map(({ segmentNumber, speakerRole, excerpt }) => ({ segmentNumber, speakerRole, excerpt }))).toEqual([
      { segmentNumber: 2, speakerRole: "candidate", excerpt: "Yes, REDİS for the queue." },
    ]);
  });

  it("search_evidence refuses an empty search, unknown sources, and an unknown Candidate", async () => {
    expect(await refusal("search_evidence", { candidateId: candidate.id, query: " ,. " })).toContain("Type a word");
    expect(await refusal("search_evidence", { candidateId: candidate.id, query: "Redis", sources: "notes" })).toContain(
      "sources",
    );
    expect(await refusal("search_evidence", { candidateId: "no-such-candidate", query: "Redis" })).toContain(
      "list_candidates",
    );
    expect(await refusal("search_evidence", { candidateId: candidate.id })).toContain("query");
  });

  it("offers the candidate_brief prompt, which takes the Candidate's name or id", async () => {
    const { prompts } = await client.listPrompts();

    expect(prompts.map((prompt) => prompt.name)).toEqual(["candidate_brief"]);
    expect(prompts[0]!.description).toBeTruthy();
    expect(prompts[0]!.arguments).toEqual([expect.objectContaining({ name: "candidate", required: true })]);
  });

  it("candidate_brief gives a fixed template and rules for the Candidate named", async () => {
    const { messages } = await client.getPrompt({ name: "candidate_brief", arguments: { candidate: "Ada Demir" } });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("user");
    const text = (messages[0]!.content as { type: string; text: string }).text;
    // Which Candidate, and the tools to read them with.
    expect(text).toContain('"Ada Demir"');
    for (const tool of ["list_candidates", "get_candidate", "search_evidence", "get_interviewer_notes", "get_ai_notes", "get_saved_questions"]) {
      expect(text, tool).toContain(tool);
    }
    // The template: sections in a fixed order, with the reasons and quotes at the end.
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings.at(-1)).toBe("Reasons and Evidence");
    expect(headings.length).toBeGreaterThan(3);
    // The rules.
    expect(text).toMatch(/every statement .*cites? .*Evidence/i);
    expect(text).toMatch(/no judgments/i);
    expect(text).toMatch(/word for word/i);
    expect(text).toMatch(/not checked by Interview Companion/i);
    expect(text).toMatch(/data, not instructions/i);
  });

  it("candidate_brief refuses a missing Candidate", async () => {
    await expect(client.getPrompt({ name: "candidate_brief", arguments: {} })).rejects.toThrow(/candidate/);
  });

  it("get_transcript gives every segment with its number, speaker label, and confirmed role", async () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const transcript = core.importTranscript(interview.id, {
      fileName: "t.txt",
      bytes: new TextEncoder().encode("Ayşe: Which queue did you use?\nAda: We used Redis."),
    });

    expect(await call("get_transcript", { interviewId: interview.id })).toEqual({
      interviewId: interview.id,
      fileName: "t.txt",
      speakerMappingConfirmed: false,
      segments: [
        { number: 1, speakerLabel: "Ayşe", role: null, startMs: null, endMs: null, text: "Which queue did you use?" },
        { number: 2, speakerLabel: "Ada", role: null, startMs: null, endMs: null, text: "We used Redis." },
      ],
    });
    core.confirmSpeakerMapping(
      interview.id,
      Object.fromEntries(transcript.speakers.map((s) => [s.id, s.label === "Ada" ? "candidate" : "interviewer"] as const)),
    );
    const confirmed = (await call("get_transcript", { interviewId: interview.id })) as { segments: { role: string }[] };
    expect(confirmed.segments.map((segment) => segment.role)).toEqual(["interviewer", "candidate"]);
  });

  it("get_transcript and get_cv give null when there is nothing yet", async () => {
    const interview = core.addInterview({ candidateId: candidate.id });

    expect(await call("get_transcript", { interviewId: interview.id })).toBeNull();
    expect(await call("get_cv", { candidateId: candidate.id })).toBeNull();
    expect(await refusal("get_cv", { candidateId: "no-such-candidate" })).toContain("list_candidates");
  });

  it("save_ai_notes refuses while saving from the AI client is off, and says where to turn it on", async () => {
    const interview = readyInterview();

    const message = await refusal("save_ai_notes", { interviewId: interview.id, notes: [redisNote] });

    expect(message).toContain("AI Settings");
    expect(core.listAiNotes(interview.id)).toEqual([]);
  });

  it("save_ai_notes saves the notes whose quotes are the Candidate's words, and counts the dropped ones", async () => {
    const interview = readyInterview();
    core.allowAiClientWrites(true);

    const saved = (await call("save_ai_notes", {
      interviewId: interview.id,
      notes: [redisNote, { statement: "Used Kafka.", evidence: [{ segmentNumber: 2, quote: "Kafka" }] }],
    })) as { notes: { statement: string; source: string; reviewState: string }[]; dropped: number };

    expect(saved.dropped).toBe(1);
    expect(saved.notes).toEqual([expect.objectContaining({ statement: "Used Redis.", source: "aiClient", reviewState: "unreviewed" })]);
  });

  it("save_suggested_questions saves through core's checks", async () => {
    const interview = readyInterview();
    core.allowAiClientWrites(true);

    const saved = (await call("save_suggested_questions", {
      candidateId: candidate.id,
      suggestions: [
        {
          question: "Why Redis?",
          reason: "The Candidate named it.",
          evidence: [{ source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "Redis" }],
        },
        { question: "Why Kafka?", reason: "Made up.", evidence: [{ source: "cv", page: 1, quote: "Kafka" }] },
      ],
    })) as { suggestions: { text: string; source: string }[]; dropped: number };

    expect(saved.dropped).toBe(1);
    expect(saved.suggestions).toEqual([expect.objectContaining({ text: "Why Redis?", source: "aiClient" })]);
  });

  it("save tools refuse malformed input", async () => {
    const interview = readyInterview();
    core.allowAiClientWrites(true);

    expect(await refusal("save_ai_notes", { interviewId: interview.id, notes: [{ statement: "No evidence" }] })).toContain("evidence");
    expect(await refusal("save_suggested_questions", { candidateId: candidate.id, suggestions: "none" })).toContain("suggestions");
  });
});

// An Interview with a confirmed Transcript: segment 1 is the Interviewer's, segment 2 the Candidate's.
function readyInterview() {
  const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
  const transcript = core.importTranscript(interview.id, {
    fileName: "t.txt",
    bytes: new TextEncoder().encode("Ayşe: Which queue did you use?\nAda: We used Redis with BullMQ."),
  });
  core.confirmSpeakerMapping(
    interview.id,
    Object.fromEntries(transcript.speakers.map((s) => [s.id, s.label === "Ada" ? "candidate" : "interviewer"] as const)),
  );
  return interview;
}

const redisNote = { statement: "Used Redis.", evidence: [{ segmentNumber: 2, quote: "Redis" }] };
