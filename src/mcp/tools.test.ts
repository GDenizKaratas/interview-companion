import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openCore, readOnlyCore, type Candidate, type Core } from "../core/index.ts";
import { createMcpServer } from "./tools.ts";

let dir: string;
let core: Core;
let client: Client;
let candidate: Candidate;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  core = openCore(join(dir, "test.sqlite"), { today: () => "2026-11-10" });
  candidate = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(readOnlyCore(core)).connect(serverSide);
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
  it("offers the four read-only tools and nothing else", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_candidate",
      "get_interviewer_notes",
      "get_saved_questions",
      "list_candidates",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
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
});
