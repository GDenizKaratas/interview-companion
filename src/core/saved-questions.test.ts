import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError, NotFoundError, openCore, type Candidate, type Core } from "./index.ts";

let dir: string;
let dbPath: string;
let core: Core;
let candidate: Candidate;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  dbPath = join(dir, "test.sqlite");
  core = openCore(dbPath);
  candidate = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

function texts(candidateId = candidate.id): string[] {
  return core.listSavedQuestions(candidateId).map((q) => q.text);
}

describe("Saved Questions", () => {
  it("lists a hand-written question after it is added, marked as written by the Interviewer", () => {
    const added = core.addSavedQuestion({ candidateId: candidate.id, text: "How did you make the payment job idempotent?" });

    expect(core.listSavedQuestions(candidate.id)).toEqual([added]);
    expect(added.text).toBe("How did you make the payment job idempotent?");
    expect(added.origin).toBe("written");
  });

  it("adds each new question at the end and keeps the order after the database is opened again", () => {
    for (const text of ["First question?", "Second question?", "Third question?"]) {
      core.addSavedQuestion({ candidateId: candidate.id, text });
    }
    core.close();

    core = openCore(dbPath);

    expect(texts()).toEqual(["First question?", "Second question?", "Third question?"]);
  });

  it("moves a question to a new place in the list, and keeps that order after the database is opened again", () => {
    const [a, b, c, d] = ["A?", "B?", "C?", "D?"].map((text) => core.addSavedQuestion({ candidateId: candidate.id, text }));

    core.moveSavedQuestion(d!.id, 0);
    expect(texts()).toEqual(["D?", "A?", "B?", "C?"]);

    core.moveSavedQuestion(d!.id, 3);
    expect(texts()).toEqual(["A?", "B?", "C?", "D?"]);

    core.moveSavedQuestion(a!.id, 2);
    expect(texts()).toEqual(["B?", "C?", "A?", "D?"]);
    core.close();

    core = openCore(dbPath);
    expect(texts()).toEqual(["B?", "C?", "A?", "D?"]);
    expect(core.listSavedQuestions(candidate.id).map((q) => q.id)).toEqual([b!.id, c!.id, a!.id, d!.id]);
  });

  it("adds a new question after the others even when the list was reordered", () => {
    const [, second] = ["A?", "B?"].map((text) => core.addSavedQuestion({ candidateId: candidate.id, text }));
    core.moveSavedQuestion(second!.id, 0);

    core.addSavedQuestion({ candidateId: candidate.id, text: "C?" });

    expect(texts()).toEqual(["B?", "A?", "C?"]);
  });

  it("edits a question's text and keeps its place and origin", () => {
    core.addSavedQuestion({ candidateId: candidate.id, text: "A?" });
    const second = core.addSavedQuestion({ candidateId: candidate.id, text: "B?" });
    core.addSavedQuestion({ candidateId: candidate.id, text: "C?" });

    const edited = core.editSavedQuestion(second.id, "  B, rewritten?  ");

    expect(edited).toEqual({ ...second, text: "B, rewritten?" });
    expect(texts()).toEqual(["A?", "B, rewritten?", "C?"]);
  });

  it("deletes a question and keeps the order of the others", () => {
    const [, second] = ["A?", "B?", "C?"].map((text) => core.addSavedQuestion({ candidateId: candidate.id, text }));

    core.deleteSavedQuestion(second!.id);

    expect(texts()).toEqual(["A?", "C?"]);
    core.addSavedQuestion({ candidateId: candidate.id, text: "D?" });
    expect(texts()).toEqual(["A?", "C?", "D?"]);
  });

  it("refuses an empty question and saves or changes nothing", () => {
    const kept = core.addSavedQuestion({ candidateId: candidate.id, text: "A?" });

    expect(() => core.addSavedQuestion({ candidateId: candidate.id, text: "  \n " })).toThrow(
      expect.objectContaining({ field: "text", rule: "required" }),
    );
    expect(() => core.editSavedQuestion(kept.id, "")).toThrow(InvalidInputError);

    expect(texts()).toEqual(["A?"]);
  });

  it("keeps line breaks inside a question", () => {
    const added = core.addSavedQuestion({ candidateId: candidate.id, text: "Walk me through the design.\nWhat would you change?" });

    expect(added.text).toBe("Walk me through the design.\nWhat would you change?");
  });

  it("refuses a question for a Candidate that does not exist", () => {
    expect(() => core.addSavedQuestion({ candidateId: "no-such-id", text: "A?" })).toThrow(NotFoundError);
  });

  it("refuses to edit, delete, or move a question that does not exist", () => {
    expect(() => core.editSavedQuestion("no-such-id", "A?")).toThrow(NotFoundError);
    expect(() => core.deleteSavedQuestion("no-such-id")).toThrow(NotFoundError);
    expect(() => core.moveSavedQuestion("no-such-id", 0)).toThrow(NotFoundError);
  });

  it("refuses a place outside the list and keeps the order", () => {
    const [a] = ["A?", "B?"].map((text) => core.addSavedQuestion({ candidateId: candidate.id, text }));

    for (const position of [-1, 2, 0.5, Number.NaN]) {
      expect(() => core.moveSavedQuestion(a!.id, position)).toThrow(
        expect.objectContaining({ field: "position", rule: "format" }),
      );
    }
    expect(texts()).toEqual(["A?", "B?"]);
  });

  it("keeps each Candidate's questions separate", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const mine = ["A?", "B?"].map((text) => core.addSavedQuestion({ candidateId: candidate.id, text }));
    core.addSavedQuestion({ candidateId: other.id, text: "X?" });
    core.addSavedQuestion({ candidateId: other.id, text: "Y?" });

    core.moveSavedQuestion(mine[1]!.id, 0);

    expect(texts()).toEqual(["B?", "A?"]);
    expect(texts(other.id)).toEqual(["X?", "Y?"]);
  });
});
