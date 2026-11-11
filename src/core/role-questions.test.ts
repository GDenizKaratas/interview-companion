import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError, NotFoundError, openCore, type Core } from "./index.ts";

const role = "Kıdemli Backend Mühendisi";

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

function roleTexts(forRole = role): string[] {
  return core.listRoleQuestions(forRole).questions.map((q) => q.text);
}

describe("Role Questions", () => {
  it("lists a role's questions in the order they were added, after the database is opened again", () => {
    core.addRoleQuestion({ role, text: "Ödeme işini nasıl idempotent yaptın?" });
    core.addRoleQuestion({ role, text: "Bir kuyruğu nasıl izlersin?" });
    core.close();

    core = openCore(dbPath);

    expect(roleTexts()).toEqual(["Ödeme işini nasıl idempotent yaptın?", "Bir kuyruğu nasıl izlersin?"]);
  });

  it("gives a new Candidate with the role a copy of each question, marked as a role question, in the role's order", () => {
    core.addRoleQuestion({ role, text: "A?" });
    core.addRoleQuestion({ role, text: "B?" });

    const candidate = core.createCandidate({ name: "Ada Demir", role: "KIDEMLİ BACKEND  MÜHENDİSİ" });

    const saved = core.listSavedQuestions(candidate.id);
    expect(saved.map((q) => [q.text, q.origin, q.interviewId])).toEqual([
      ["A?", "role", null],
      ["B?", "role", null],
    ]);
    expect(candidate.role).toBe(role);
  });

  it("gives a Candidate with another role none of them", () => {
    core.addRoleQuestion({ role, text: "A?" });

    const candidate = core.createCandidate({ name: "Ada Demir", role: "Frontend Engineer" });

    expect(core.listSavedQuestions(candidate.id)).toEqual([]);
  });

  it("does not change an existing Candidate when the role's list changes, and offers the new question instead", () => {
    const first = core.addRoleQuestion({ role, text: "A?" });
    const candidate = core.createCandidate({ name: "Ada Demir", role });

    core.editRoleQuestion(first.id, "A, edited?");
    const added = core.addRoleQuestion({ role, text: "B?" });

    expect(core.listSavedQuestions(candidate.id).map((q) => q.text)).toEqual(["A?"]);
    expect(core.listMissingRoleQuestions(candidate.id)).toEqual([added]);
  });

  it("adds the missing role questions to one Candidate with one call, after their own questions", () => {
    core.addRoleQuestion({ role, text: "A?" });
    const candidate = core.createCandidate({ name: "Ada Demir", role });
    core.addSavedQuestion({ candidateId: candidate.id, text: "Own question?" });
    core.addRoleQuestion({ role, text: "B?" });
    core.addRoleQuestion({ role, text: "C?" });

    const added = core.addMissingRoleQuestions(candidate.id);

    expect(added.map((q) => [q.text, q.origin])).toEqual([
      ["B?", "role"],
      ["C?", "role"],
    ]);
    expect(core.listSavedQuestions(candidate.id).map((q) => q.text)).toEqual(["A?", "Own question?", "B?", "C?"]);
    expect(core.listMissingRoleQuestions(candidate.id)).toEqual([]);
    expect(core.addMissingRoleQuestions(candidate.id)).toEqual([]);
  });

  it("does not offer a role question again after the Interviewer deleted its copy", () => {
    core.addRoleQuestion({ role, text: "A?" });
    const candidate = core.createCandidate({ name: "Ada Demir", role });

    core.deleteSavedQuestion(core.listSavedQuestions(candidate.id)[0]!.id);

    expect(core.listMissingRoleQuestions(candidate.id)).toEqual([]);
    expect(core.addMissingRoleQuestions(candidate.id)).toEqual([]);
  });

  it("says how many Candidates of the role miss a question, and adds the missing questions to all of them", () => {
    core.addRoleQuestion({ role, text: "A?" });
    const ada = core.createCandidate({ name: "Ada Demir", role });
    const can = core.createCandidate({ name: "Can Ak", role });
    const other = core.createCandidate({ name: "Eda Su", role: "Frontend Engineer" });
    expect(core.listRoleQuestions(role).candidatesMissingQuestions).toBe(0);

    core.addRoleQuestion({ role, text: "B?" });
    expect(core.listRoleQuestions(role).candidatesMissingQuestions).toBe(2);

    expect(core.addRoleQuestionsToCandidates(role)).toBe(2);

    expect(core.listSavedQuestions(ada.id).map((q) => q.text)).toEqual(["A?", "B?"]);
    expect(core.listSavedQuestions(can.id).map((q) => q.text)).toEqual(["A?", "B?"]);
    expect(core.listSavedQuestions(other.id)).toEqual([]);
    expect(core.listRoleQuestions(role).candidatesMissingQuestions).toBe(0);
  });

  it("refuses an unknown Candidate", () => {
    expect(() => core.listMissingRoleQuestions("nobody")).toThrow(NotFoundError);
    expect(() => core.addMissingRoleQuestions("nobody")).toThrow(NotFoundError);
  });

  it("moves a question to a new place in its role's list, and keeps that order after the database is opened again", () => {
    const [a, , , d] = ["A?", "B?", "C?", "D?"].map((text) => core.addRoleQuestion({ role, text }));
    core.addRoleQuestion({ role: "Frontend Engineer", text: "Other role?" });

    core.moveRoleQuestion(d!.id, 0);
    expect(roleTexts()).toEqual(["D?", "A?", "B?", "C?"]);
    core.moveRoleQuestion(a!.id, 3);
    core.close();

    core = openCore(dbPath);
    expect(roleTexts()).toEqual(["D?", "B?", "C?", "A?"]);
    expect(roleTexts("Frontend Engineer")).toEqual(["Other role?"]);
    expect(() => core.moveRoleQuestion(a!.id, 4)).toThrow(InvalidInputError);
    expect(() => core.moveRoleQuestion(a!.id, -1)).toThrow(InvalidInputError);
  });

  it("deletes a role question without touching the copies Candidates already have", () => {
    const question = core.addRoleQuestion({ role, text: "A?" });
    const candidate = core.createCandidate({ name: "Ada Demir", role });

    core.deleteRoleQuestion(question.id);

    expect(roleTexts()).toEqual([]);
    expect(core.listSavedQuestions(candidate.id).map((q) => [q.text, q.origin])).toEqual([["A?", "role"]]);
    expect(() => core.deleteRoleQuestion(question.id)).toThrow(NotFoundError);
    expect(() => core.editRoleQuestion(question.id, "B?")).toThrow(NotFoundError);
  });

  it("finds the same role whatever its letter case and spaces, and keeps the spelling written first", () => {
    core.addRoleQuestion({ role: "  kıdemli backend   mühendisi ", text: "A?" });
    core.addRoleQuestion({ role: "KIDEMLİ BACKEND MÜHENDİSİ", text: "B?" });

    const list = core.listRoleQuestions("Kıdemli Backend Mühendisi");

    expect(list.role).toBe("kıdemli backend mühendisi");
    expect(list.questions.map((q) => q.text)).toEqual(["A?", "B?"]);
    expect(core.listCandidateRoles()).toEqual(["kıdemli backend mühendisi"]);
    expect(core.createCandidate({ name: "Ada Demir", role: "Kıdemli backend mühendisi" }).role).toBe(
      "kıdemli backend mühendisi",
    );
  });

  it("refuses a question without text or without a role, and an empty role when listing", () => {
    expect(() => core.addRoleQuestion({ role, text: "  " })).toThrow(
      expect.objectContaining({ field: "text", rule: "required" }),
    );
    expect(() => core.addRoleQuestion({ role: " ", text: "A?" })).toThrow(
      expect.objectContaining({ field: "role", rule: "required" }),
    );
    expect(() => core.listRoleQuestions("")).toThrow(InvalidInputError);
    const question = core.addRoleQuestion({ role, text: "A?" });
    expect(() => core.editRoleQuestion(question.id, "")).toThrow(InvalidInputError);
    expect(roleTexts()).toEqual(["A?"]);
  });
});
