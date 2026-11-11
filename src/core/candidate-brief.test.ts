import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makePdf } from "./testing/make-pdf.ts";
import { openCore, PreconditionError, type Candidate, type Core, type NewBriefEvidence } from "./index.ts";

// The Candidate Brief an AI client writes and saves through MCP. Core stores it as given and
// checks its quotes against the Candidate's sources each time it is read.

let dir: string;
let core: Core;
let candidate: Candidate;
let clock: Date;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  clock = new Date("2026-11-10T09:30:00Z");
  core = openCore(join(dir, "test.sqlite"), { now: () => clock });
  candidate = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

const briefText = "# Candidate Brief: Ece Yalın, Backend Engineer\n\n## From the Interviews\n\n- Redis ile BullMQ kullandı [1].";

describe("Saving a Candidate Brief", () => {
  it("is refused while saving from the AI client is off", () => {
    expect(() => core.saveCandidateBriefFromClient(candidate.id, { text: briefText, evidence: [] })).toThrow(
      expect.objectContaining({ reason: "aiClientWritesOff" }),
    );
    expect(() => core.saveCandidateBriefFromClient(candidate.id, { text: briefText, evidence: [] })).toThrow(
      PreconditionError,
    );
    expect(core.getCandidateBrief(candidate.id)).toBeNull();
  });

  it("stores the text with the time it was saved", () => {
    core.allowAiClientWrites(true);

    core.saveCandidateBriefFromClient(candidate.id, { text: briefText, evidence: [] });

    expect(core.getCandidateBrief(candidate.id)).toEqual({
      candidateId: candidate.id,
      text: briefText,
      savedAt: "2026-11-10T09:30:00.000Z",
      evidence: [],
    });
  });

  it("replaces the earlier brief when saved again", () => {
    core.allowAiClientWrites(true);
    core.saveCandidateBriefFromClient(candidate.id, {
      text: "First brief [1].",
      evidence: [{ number: 1, source: "cv", page: 1, quote: "Redis" }],
    });
    clock = new Date("2026-11-11T08:00:00Z");

    core.saveCandidateBriefFromClient(candidate.id, { text: "Second brief.", evidence: [] });

    expect(core.getCandidateBrief(candidate.id)).toEqual(
      expect.objectContaining({ text: "Second brief.", savedAt: "2026-11-11T08:00:00.000Z", evidence: [] }),
    );
  });

  it("refuses a brief without text, and keeps the earlier one", () => {
    core.allowAiClientWrites(true);
    core.saveCandidateBriefFromClient(candidate.id, { text: briefText, evidence: [] });

    expect(() => core.saveCandidateBriefFromClient(candidate.id, { text: "  ", evidence: [] })).toThrow(
      expect.objectContaining({ field: "text", rule: "required" }),
    );
    expect(core.getCandidateBrief(candidate.id)?.text).toBe(briefText);
  });

  it("refuses two Evidence references with the same number", () => {
    core.allowAiClientWrites(true);
    const evidence: NewBriefEvidence[] = [
      { number: 1, source: "cv", page: 1, quote: "Redis" },
      { number: 1, source: "cv", page: 1, quote: "BullMQ" },
    ];

    expect(() => core.saveCandidateBriefFromClient(candidate.id, { text: briefText, evidence })).toThrow(
      expect.objectContaining({ field: "evidence", rule: "format" }),
    );
    expect(core.getCandidateBrief(candidate.id)).toBeNull();
  });
});

describe("Reading a Candidate Brief", () => {
  beforeEach(() => core.allowAiClientWrites(true));

  async function withCvAndTranscript() {
    await core.attachCv(candidate.id, {
      fileName: "ece.pdf",
      bytes: makePdf([[{ text: "Ece Yalın", size: 24 }, { text: "Built job queues with Redis and BullMQ.", size: 11 }]]),
    });
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    core.importTranscript(interview.id, {
      fileName: "t.txt",
      bytes: new TextEncoder().encode("Ayşe: Arka plan işlerini nasıl çalıştırdınız?\nEce: Redis ile BullMQ kullandık."),
    });
    return interview;
  }

  it("marks each quote found when it is word for word in its CV page or Transcript segment", async () => {
    const interview = await withCvAndTranscript();
    const evidence: NewBriefEvidence[] = [
      { number: 1, source: "cv", page: 1, quote: "job queues with Redis" },
      { number: 2, source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "Redis ile BullMQ" },
      { number: 3, source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "Kafka kullandık" },
      { number: 4, source: "cv", page: 2, quote: "Redis" },
      { number: 5, source: "transcript", interviewId: interview.id, segmentNumber: 9, quote: "Redis" },
    ];

    core.saveCandidateBriefFromClient(candidate.id, { text: briefText, evidence });

    expect(core.getCandidateBrief(candidate.id)?.evidence).toEqual([
      { ...evidence[0], found: true },
      { ...evidence[1], found: true, speakerRole: null },
      { ...evidence[2], found: false, speakerRole: null },
      { ...evidence[3], found: false },
      { ...evidence[4], found: false, speakerRole: null },
    ]);
  });

  it("says whose words a Transcript quote is, only once the Speaker Mapping is confirmed", async () => {
    const interview = await withCvAndTranscript();
    core.saveCandidateBriefFromClient(candidate.id, {
      text: "Asked about background jobs [1]; used Redis [2].",
      evidence: [
        { number: 1, source: "transcript", interviewId: interview.id, segmentNumber: 1, quote: "Arka plan" },
        { number: 2, source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "Redis ile BullMQ" },
      ],
    });
    // Found is about the words only; before the mapping is confirmed nobody is known to have said them.
    expect(core.getCandidateBrief(candidate.id)?.evidence.map((e) => [e.found, "speakerRole" in e && e.speakerRole])).toEqual([
      [true, null],
      [true, null],
    ]);

    const transcript = core.getTranscript(interview.id)!;
    core.confirmSpeakerMapping(
      interview.id,
      Object.fromEntries(transcript.speakers.map((s) => [s.id, s.label === "Ece" ? "candidate" : "interviewer"] as const)),
    );

    expect(core.getCandidateBrief(candidate.id)?.evidence).toEqual([
      expect.objectContaining({ number: 1, found: true, speakerRole: "interviewer" }),
      expect.objectContaining({ number: 2, found: true, speakerRole: "candidate" }),
    ]);
  });

  it("checks quotes again on every read, so a replaced Transcript shows its quotes as not found", async () => {
    const interview = await withCvAndTranscript();
    core.saveCandidateBriefFromClient(candidate.id, {
      text: briefText,
      evidence: [{ number: 1, source: "transcript", interviewId: interview.id, segmentNumber: 2, quote: "Redis ile BullMQ" }],
    });

    core.importTranscript(interview.id, {
      fileName: "t2.txt",
      bytes: new TextEncoder().encode("Ayşe: Hangi veritabanı?\nEce: PostgreSQL."),
    });

    expect(core.getCandidateBrief(candidate.id)?.evidence).toEqual([expect.objectContaining({ number: 1, found: false })]);
  });

  it("never finds a quote from another Candidate's Interview", async () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Backend Engineer" });
    const othersInterview = core.addInterview({ candidateId: other.id });
    core.importTranscript(othersInterview.id, {
      fileName: "t.txt",
      bytes: new TextEncoder().encode("Ayşe: Kuyruk?\nCan: Redis ile BullMQ kullandık."),
    });

    core.saveCandidateBriefFromClient(candidate.id, {
      text: briefText,
      evidence: [{ number: 1, source: "transcript", interviewId: othersInterview.id, segmentNumber: 2, quote: "Redis ile BullMQ" }],
    });

    expect(core.getCandidateBrief(candidate.id)?.evidence).toEqual([expect.objectContaining({ found: false })]);
  });

  it("is gone when the Candidate is deleted", () => {
    core.saveCandidateBriefFromClient(candidate.id, { text: briefText, evidence: [] });

    core.deleteCandidate(candidate.id);

    expect(() => core.getCandidateBrief(candidate.id)).toThrow(expect.objectContaining({ name: "NotFoundError" }));
    const recreated = core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
    expect(core.getCandidateBrief(recreated.id)).toBeNull();
  });
});
