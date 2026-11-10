import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, openCore, type Core } from "./index.ts";

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
