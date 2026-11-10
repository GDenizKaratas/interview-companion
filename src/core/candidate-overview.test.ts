import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, openCore, type Candidate, type Core } from "./index.ts";
import { makePdf } from "./testing/make-pdf.ts";

let dir: string;
let core: Core;
let candidate: Candidate;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  core = openCore(join(dir, "test.sqlite"), { today: () => "2026-11-10" });
  candidate = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Candidate overview", () => {
  it("refuses an unknown Candidate", () => {
    expect(() => core.getCandidateOverview("no-such-candidate")).toThrow(NotFoundError);
  });

  it("shows a new Candidate with no CV, no Interviews, and nothing written yet", () => {
    expect(core.getCandidateOverview(candidate.id)).toEqual({
      candidate,
      cv: null,
      interviews: [],
      interviewerNoteCount: 0,
      savedQuestionCount: 0,
    });
  });

  it("counts the CV pages, the notes, and the questions, and shows each Interview's Transcript state", async () => {
    await core.attachCv(candidate.id, {
      fileName: "ada-demir-cv.pdf",
      bytes: makePdf([[{ text: "Ada Demir", size: 24 }], [{ text: "Payments, 2021 to 2025", size: 10 }]]),
    });
    const first = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const planned = core.addInterview({ candidateId: candidate.id, date: "2026-11-20" });
    const transcript = core.importTranscript(first.id, {
      fileName: "first.txt",
      bytes: new TextEncoder().encode("Ayşe: Tell me about the payment job.\nAda: It retried safely.\nAyşe: Thanks."),
    });
    core.confirmSpeakerMapping(
      first.id,
      Object.fromEntries(transcript.speakers.map((s) => [s.id, s.label === "Ada" ? "candidate" : "interviewer"])),
    );
    core.addInterviewerNotes({ candidateId: candidate.id, text: "Clear about retries\nAsk about queues" });
    core.addSavedQuestion({ candidateId: candidate.id, text: "How did you make the payment job idempotent?" });

    const overview = core.getCandidateOverview(candidate.id);

    expect(overview.cv).toMatchObject({ fileName: "ada-demir-cv.pdf", pageCount: 2 });
    expect(overview.interviews).toEqual([
      {
        ...first,
        transcript: { fileName: "first.txt", format: "plain-text", segmentCount: 3, speakerMappingConfirmed: true },
      },
      { ...planned, transcript: null },
    ]);
    expect(overview.interviewerNoteCount).toBe(2);
    expect(overview.savedQuestionCount).toBe(1);
  });

  it("shows a Transcript whose Speaker Mapping is not confirmed yet", () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    core.importTranscript(interview.id, { fileName: "t.txt", bytes: new TextEncoder().encode("Ada: Hello.") });

    expect(core.getCandidateOverview(candidate.id).interviews[0]!.transcript?.speakerMappingConfirmed).toBe(false);
  });
});
