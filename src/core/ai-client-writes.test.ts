import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiClientCore, openCore, PreconditionError, type Candidate, type Core, type Interview, type Transcript } from "./index.ts";

// The AI client (Claude Code or Claude Desktop through MCP) writes AI Notes and Suggested
// Questions itself, without an API key in the app, and core saves them through the same checks
// as in-app generation.

let dir: string;
let core: Core;
let candidate: Candidate;
let interview: Interview;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  core = openCore(join(dir, "test.sqlite"), { now: () => new Date("2026-11-10T09:30:00Z") });
  candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
  interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

// Segment 1 is the Interviewer, segment 2 the Candidate.
function importTranscript(): Transcript {
  return core.importTranscript(interview.id, {
    fileName: "t.txt",
    bytes: new TextEncoder().encode("Ayşe: Arka plan işlerini nasıl çalıştırdınız?\nEce: Redis ile BullMQ kullandık."),
  });
}

function confirmRoles(transcript: Transcript): void {
  core.confirmSpeakerMapping(
    interview.id,
    Object.fromEntries(transcript.speakers.map((s) => [s.id, s.label === "Ece" ? "candidate" : "interviewer"] as const)),
  );
}

const backedNote = { statement: "Redis ve BullMQ kullandı.", evidence: [{ segmentNumber: 2, quote: "Redis ile BullMQ" }] };
// Segment 1 is the Interviewer's, so it is not Evidence of what the Candidate said.
const interviewerQuote = { statement: "Arka plan işlerinden söz etti.", evidence: [{ segmentNumber: 1, quote: "Arka plan" }] };
const madeUpQuote = { statement: "Kafka kullandı.", evidence: [{ segmentNumber: 2, quote: "Kafka" }] };

describe("Writes from the AI client", () => {
  it("are off until the Interviewer turns them on, and then refused with a reason", () => {
    confirmRoles(importTranscript());

    expect(core.aiClientWritesAllowed()).toBe(false);
    expect(() => core.saveAiNotesFromClient(interview.id, [backedNote])).toThrow(
      expect.objectContaining({ reason: "aiClientWritesOff" }),
    );
    expect(() => core.saveSuggestedQuestionsFromClient(candidate.id, [])).toThrow(PreconditionError);
    expect(core.listAiNotes(interview.id)).toEqual([]);
  });

  it("can be turned on and off again", () => {
    core.allowAiClientWrites(true);
    expect(core.aiClientWritesAllowed()).toBe(true);

    core.allowAiClientWrites(false);
    expect(core.aiClientWritesAllowed()).toBe(false);
  });
});

describe("AI Notes from the AI client", () => {
  beforeEach(() => core.allowAiClientWrites(true));

  it("saves the notes whose quotes are the Candidate's words, as Unreviewed and marked as from the AI client", () => {
    confirmRoles(importTranscript());

    const saved = core.saveAiNotesFromClient(interview.id, [backedNote, interviewerQuote, madeUpQuote]);

    expect(saved.dropped).toBe(2);
    expect(saved.notes).toEqual([
      expect.objectContaining({
        statement: "Redis ve BullMQ kullandı.",
        reviewState: "unreviewed",
        source: "aiClient",
        evidence: [{ segmentNumber: 2, quote: "Redis ile BullMQ" }],
      }),
    ]);
  });

  it("refuses before the Speaker Mapping is confirmed, as in-app generation does", () => {
    importTranscript();

    expect(() => core.saveAiNotesFromClient(interview.id, [backedNote])).toThrow(
      expect.objectContaining({ reason: "speakerMappingNotConfirmed" }),
    );
  });

  it("keeps the Interviewer's reviewed notes and replaces only Unreviewed ones, as regenerating does", () => {
    confirmRoles(importTranscript());
    const [first] = core.saveAiNotesFromClient(interview.id, [backedNote]).notes;
    core.confirmAiNote(first!.id);

    const second = core.saveAiNotesFromClient(interview.id, [backedNote]);

    expect(second.notes.map((note) => note.reviewState).sort()).toEqual(["confirmed", "unreviewed"]);
  });
});

describe("Suggested Questions from the AI client", () => {
  beforeEach(() => core.allowAiClientWrites(true));

  it("saves backed and general suggestions, drops one with a quote from an unconfirmed Transcript, and marks them as from the AI client", () => {
    importTranscript();

    const saved = core.saveSuggestedQuestionsFromClient(candidate.id, [
      { question: "Ekibin nasıl çalışıyordu?", reason: "Genel bir başlangıç.", evidence: [] },
      {
        question: "BullMQ işleri neden yeniden deneniyordu?",
        reason: "Transcript'te geçiyor.",
        evidence: [{ source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "BullMQ" }],
      },
    ]);

    expect(saved.dropped).toBe(1);
    expect(saved.leftOut).toEqual([interview.id]);
    expect(saved.suggestions).toEqual([
      expect.objectContaining({ text: "Ekibin nasıl çalışıyordu?", general: true, source: "aiClient" }),
    ]);
  });

  it("saves a suggestion whose quote is in a confirmed Transcript", () => {
    confirmRoles(importTranscript());

    const saved = core.saveSuggestedQuestionsFromClient(candidate.id, [
      {
        question: "BullMQ işleri neden yeniden deneniyordu?",
        reason: "Transcript'te geçiyor.",
        evidence: [{ source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "BullMQ" }],
      },
    ]);

    expect(saved.dropped).toBe(0);
    expect(saved.suggestions[0]).toEqual(expect.objectContaining({ general: false, source: "aiClient" }));
  });
});

describe("The AI client's view of core", () => {
  it("holds the read operations and only the writes that go through core's checks, not the switch that allows them", () => {
    const view = aiClientCore(core);

    expect(Object.keys(view)).toContain("listCandidates");
    expect(Object.keys(view)).toContain("saveAiNotesFromClient");
    expect(Object.keys(view)).toContain("saveSuggestedQuestionsFromClient");
    expect(Object.keys(view)).toContain("saveCandidateBriefFromClient");
    expect(Object.keys(view)).not.toContain("allowAiClientWrites");
    expect(Object.keys(view)).not.toContain("addInterviewerNotes");
    expect(Object.keys(view)).not.toContain("deleteCandidate");
  });
});

describe("The switch for writes from the AI client", () => {
  it("is read on every save, so turning it off stops the next save at once", () => {
    confirmRoles(importTranscript());
    core.allowAiClientWrites(true);
    expect(core.saveAiNotesFromClient(interview.id, [backedNote]).notes).toHaveLength(1);

    core.allowAiClientWrites(false);

    expect(() => core.saveAiNotesFromClient(interview.id, [backedNote])).toThrow(
      expect.objectContaining({ reason: "aiClientWritesOff" }),
    );
  });
});

describe("Quotes in the AI client's suggestions", () => {
  it("cannot come from another Candidate's Transcript or an unknown Interview", () => {
    confirmRoles(importTranscript());
    core.allowAiClientWrites(true);
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });

    const saved = core.saveSuggestedQuestionsFromClient(other.id, [
      {
        question: "BullMQ?",
        reason: "Quotes Ece's Transcript.",
        evidence: [{ source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "BullMQ" }],
      },
      {
        question: "Kafka?",
        reason: "Quotes an Interview that does not exist.",
        evidence: [{ source: "transcript", interviewId: "no-such-interview", segmentNumber: 1, quote: "Kafka" }],
      },
    ]);

    expect(saved.dropped).toBe(2);
    expect(saved.suggestions).toEqual([]);
  });
});

