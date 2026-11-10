import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, openCore, type Core } from "./index.ts";
import { makePdf } from "./testing/make-pdf.ts";

let dir: string;
let dbPath: string;
let core: Core;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  dbPath = join(dir, "test.sqlite");
  core = openCore(dbPath);
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

// A Candidate with one of everything: two Interviews, tagged and untagged notes, and questions.
function candidateWithEverything(name: string) {
  const candidate = core.createCandidate({ name, role: "Backend Engineer" });
  const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
  core.addInterview({ candidateId: candidate.id });
  const notes = [
    ...core.addInterviewerNotes({ candidateId: candidate.id, interviewId: interview.id, text: "Tagged note" }),
    ...core.addInterviewerNotes({ candidateId: candidate.id, text: "Untagged note" }),
  ];
  const question = core.addSavedQuestion({ candidateId: candidate.id, text: "A question?" });
  return { candidate, interview, notes, question };
}

describe("Deleting a Candidate", () => {
  it("leaves no data of that Candidate readable through core", () => {
    const { candidate, notes, question } = candidateWithEverything("Ada Demir");

    core.deleteCandidate(candidate.id);

    expect(core.getCandidate(candidate.id)).toBeUndefined();
    expect(core.listCandidates()).toEqual([]);
    expect(() => core.listInterviews(candidate.id)).toThrow(NotFoundError);
    expect(() => core.listInterviewerNotes(candidate.id)).toThrow(NotFoundError);
    expect(() => core.listSavedQuestions(candidate.id)).toThrow(NotFoundError);
    for (const note of notes) {
      expect(() => core.editInterviewerNote(note.id, "Changed")).toThrow(NotFoundError);
    }
    expect(() => core.editSavedQuestion(question.id, "Changed?")).toThrow(NotFoundError);
  });

  it("removes the Candidate's CV file and keeps the CV of every other Candidate", async () => {
    const cv = makePdf([[{ text: "Ada Demir", size: 24 }]]);
    const deleted = await core.createCandidateWithCv({ name: "Ada Demir", role: "Backend Engineer", cv: { fileName: "ada.pdf", bytes: cv } });
    const kept = await core.createCandidateWithCv({ name: "Can Aksoy", role: "Backend Engineer", cv: { fileName: "can.pdf", bytes: cv } });

    core.deleteCandidate(deleted.id);

    expect(core.getCv(deleted.id)).toBeUndefined();
    expect(core.readCvFile(kept.id)?.bytes).toEqual(cv);
    expect(readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((path) => path.endsWith(".pdf"))).toHaveLength(1);
  });

  it("keeps every other Candidate and their data as they were", () => {
    const deleted = candidateWithEverything("Ada Demir");
    const kept = candidateWithEverything("Can Aksoy");
    const keptBefore = {
      interviews: core.listInterviews(kept.candidate.id),
      notes: core.listInterviewerNotes(kept.candidate.id),
      questions: core.listSavedQuestions(kept.candidate.id),
    };

    core.deleteCandidate(deleted.candidate.id);

    expect(core.listCandidates()).toEqual([kept.candidate]);
    expect(core.listInterviews(kept.candidate.id)).toEqual(keptBefore.interviews);
    expect(core.listInterviewerNotes(kept.candidate.id)).toEqual(keptBefore.notes);
    expect(core.listSavedQuestions(kept.candidate.id)).toEqual(keptBefore.questions);
  });

  it("stays deleted after the database is closed and opened again", () => {
    const { candidate } = candidateWithEverything("Ada Demir");
    core.deleteCandidate(candidate.id);
    core.close();

    core = openCore(dbPath);

    expect(core.getCandidate(candidate.id)).toBeUndefined();
  });

  it("refuses an unknown Candidate with NotFoundError", () => {
    candidateWithEverything("Ada Demir");

    expect(() => core.deleteCandidate("no-such-id")).toThrow(NotFoundError);
    expect(core.listCandidates()).toHaveLength(1);
  });
});
