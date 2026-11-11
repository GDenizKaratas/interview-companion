import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

function addAll(...questionTexts: string[]) {
  return questionTexts.map((text) => core.addSavedQuestion({ candidateId: candidate.id, text }));
}

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
    addAll("First question?", "Second question?", "Third question?");
    core.close();

    core = openCore(dbPath);

    expect(texts()).toEqual(["First question?", "Second question?", "Third question?"]);
  });

  it("moves a question to a new place in the list, and keeps that order after the database is opened again", () => {
    const [a, b, c, d] = addAll("A?", "B?", "C?", "D?");

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
    const [, second] = addAll("A?", "B?");
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
    const [, second] = addAll("A?", "B?", "C?");

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

  it("refuses to add or list questions for a Candidate that does not exist", () => {
    expect(() => core.addSavedQuestion({ candidateId: "no-such-id", text: "A?" })).toThrow(NotFoundError);
    expect(() => core.listSavedQuestions("no-such-id")).toThrow(NotFoundError);
  });

  it("refuses to edit, delete, or move a question that does not exist", () => {
    expect(() => core.editSavedQuestion("no-such-id", "A?")).toThrow(NotFoundError);
    expect(() => core.deleteSavedQuestion("no-such-id")).toThrow(NotFoundError);
    expect(() => core.moveSavedQuestion("no-such-id", 0)).toThrow(NotFoundError);
  });

  it("refuses a place outside the list and keeps the order", () => {
    const [a] = addAll("A?", "B?");

    for (const position of [-1, 2, 0.5, Number.NaN]) {
      expect(() => core.moveSavedQuestion(a!.id, position)).toThrow(
        expect.objectContaining({ field: "position", rule: "format" }),
      );
    }
    expect(texts()).toEqual(["A?", "B?"]);
  });

  it("keeps each Candidate's questions separate", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const mine = addAll("A?", "B?");
    core.addSavedQuestion({ candidateId: other.id, text: "X?" });
    core.addSavedQuestion({ candidateId: other.id, text: "Y?" });

    core.moveSavedQuestion(mine[1]!.id, 0);

    expect(texts()).toEqual(["B?", "A?"]);
    expect(texts(other.id)).toEqual(["X?", "Y?"]);
  });
});

describe("Interview tag of Saved Questions", () => {
  function addInterview(date: string) {
    return core.addInterview({ candidateId: candidate.id, date });
  }

  it("tags a new question with one of the Candidate's Interviews, or leaves it untagged", () => {
    const first = addInterview("2026-11-03");
    const tagged = core.addSavedQuestion({ candidateId: candidate.id, interviewId: first.id, text: "Tagged?" });
    const untagged = core.addSavedQuestion({ candidateId: candidate.id, text: "Untagged?" });

    expect(tagged.interviewId).toBe(first.id);
    expect(untagged.interviewId).toBeNull();
    expect(core.listSavedQuestions(candidate.id)).toEqual([tagged, untagged]);
  });

  it("changes a question's tag to another Interview or to none, and keeps its text and place", () => {
    const first = addInterview("2026-11-03");
    const second = addInterview("2026-11-10");
    const [question, other] = addAll("Tag me?", "Leave me?");

    const moved = core.tagSavedQuestion(question!.id, second.id);
    expect(moved).toEqual({ ...question, interviewId: second.id });
    expect(core.tagSavedQuestion(question!.id, first.id).interviewId).toBe(first.id);

    const untagged = core.tagSavedQuestion(question!.id, null);
    expect(untagged.interviewId).toBeNull();
    expect(core.listSavedQuestions(candidate.id)).toEqual([untagged, other]);
  });

  it("refuses an Interview of another Candidate, or an unknown question, and changes nothing", () => {
    const otherCandidate = core.createCandidate({ name: "Can Yilmaz", role: "Frontend Engineer" });
    const foreign = core.addInterview({ candidateId: otherCandidate.id, date: "2026-11-03" });
    const [question] = addAll("Mine?");

    expect(() => core.addSavedQuestion({ candidateId: candidate.id, interviewId: foreign.id, text: "Foreign?" })).toThrow(NotFoundError);
    expect(() => core.tagSavedQuestion(question!.id, foreign.id)).toThrow(NotFoundError);
    expect(() => core.tagSavedQuestion("no-such-question", null)).toThrow(NotFoundError);
    expect(core.listSavedQuestions(candidate.id)).toEqual([question]);
  });

  it("lists, for one Interview, the questions tagged with it and the untagged ones, in the Interviewer's order", () => {
    const first = addInterview("2026-11-03");
    const second = addInterview("2026-11-10");
    const forFirst = core.addSavedQuestion({ candidateId: candidate.id, interviewId: first.id, text: "For the first?" });
    const general = core.addSavedQuestion({ candidateId: candidate.id, text: "For every Interview?" });
    const forSecond = core.addSavedQuestion({ candidateId: candidate.id, interviewId: second.id, text: "For the second?" });
    core.moveSavedQuestion(forSecond.id, 0);

    expect(core.listSavedQuestions(candidate.id, { interviewId: first.id })).toEqual([forFirst, general]);
    expect(core.listSavedQuestions(candidate.id, { interviewId: second.id })).toEqual([forSecond, general]);
    expect(core.listSavedQuestions(candidate.id, { interviewId: null })).toEqual([forSecond, forFirst, general]);
    expect(core.listSavedQuestions(candidate.id)).toEqual([forSecond, forFirst, general]);
  });

  it("refuses to filter by an Interview of another Candidate", () => {
    const otherCandidate = core.createCandidate({ name: "Can Yilmaz", role: "Frontend Engineer" });
    const foreign = core.addInterview({ candidateId: otherCandidate.id, date: "2026-11-03" });

    expect(() => core.listSavedQuestions(candidate.id, { interviewId: foreign.id })).toThrow(NotFoundError);
  });

  it("moves a question within the filtered list, next to the question it passes, and leaves hidden ones where they are", () => {
    const first = addInterview("2026-11-03");
    const second = addInterview("2026-11-10");
    core.addSavedQuestion({ candidateId: candidate.id, interviewId: second.id, text: "For the second?" });
    const forFirst = core.addSavedQuestion({ candidateId: candidate.id, interviewId: first.id, text: "For the first?" });
    core.addSavedQuestion({ candidateId: candidate.id, interviewId: second.id, text: "Also for the second?" });
    const general = core.addSavedQuestion({ candidateId: candidate.id, text: "For every Interview?" });
    const onlyFirst = { interviewId: first.id };

    core.moveSavedQuestion(general.id, 0, onlyFirst);
    expect(texts()).toEqual(["For the second?", "For every Interview?", "For the first?", "Also for the second?"]);

    core.moveSavedQuestion(general.id, 1, onlyFirst);
    expect(texts()).toEqual(["For the second?", "For the first?", "For every Interview?", "Also for the second?"]);
    expect(core.listSavedQuestions(candidate.id, onlyFirst)).toEqual([forFirst, general]);
  });

  it("refuses to move a question that the filter hides, or to a place outside the filtered list", () => {
    const first = addInterview("2026-11-03");
    const second = addInterview("2026-11-10");
    const hidden = core.addSavedQuestion({ candidateId: candidate.id, interviewId: second.id, text: "Hidden?" });
    const shown = core.addSavedQuestion({ candidateId: candidate.id, interviewId: first.id, text: "Shown?" });
    core.addSavedQuestion({ candidateId: candidate.id, text: "General?" });
    const onlyFirst = { interviewId: first.id };

    expect(() => core.moveSavedQuestion(hidden.id, 0, onlyFirst)).toThrow(InvalidInputError);
    expect(() => core.moveSavedQuestion(shown.id, 2, onlyFirst)).toThrow(InvalidInputError);
    expect(texts()).toEqual(["Hidden?", "Shown?", "General?"]);
  });

  it("leaves the order alone when a question is moved to the place it already has", () => {
    const first = addInterview("2026-11-03");
    const second = addInterview("2026-11-10");
    core.addSavedQuestion({ candidateId: candidate.id, interviewId: second.id, text: "Hidden?" });
    const only = core.addSavedQuestion({ candidateId: candidate.id, interviewId: first.id, text: "The only one shown?" });

    core.moveSavedQuestion(only.id, 0, { interviewId: first.id });
    expect(texts()).toEqual(["Hidden?", "The only one shown?"]);
  });
});

describe("The Interviewer's mark on a Saved Question", () => {
  it("has no mark until the Interviewer sets one, and keeps the mark after the database is opened again", () => {
    const [first, second, third] = addAll("A?", "B?", "C?");
    expect(first!.mark).toBeNull();

    expect(core.markSavedQuestion(first!.id, "asked").mark).toBe("asked");
    core.markSavedQuestion(second!.id, "notAsked");
    core.markSavedQuestion(third!.id, "asked");
    core.markSavedQuestion(third!.id, null);
    core.close();

    core = openCore(dbPath);
    expect(core.listSavedQuestions(candidate.id).map((q) => q.mark)).toEqual(["asked", "notAsked", null]);
  });

  it("keeps the Saved Questions of a database made before they had a mark", () => {
    const [question] = addAll("A?");
    core.close();
    // Puts the file back to the schema before the mark column: two versions earlier, without it
    // and without the Asked Question mark that came after it.
    const file = new DatabaseSync(dbPath);
    const { user_version: version } = file.prepare("PRAGMA user_version").get() as { user_version: number };
    file.exec(
      `ALTER TABLE asked_question DROP COLUMN marked_wrong; ALTER TABLE saved_question DROP COLUMN mark; PRAGMA user_version = ${version - 2};`,
    );
    file.close();

    core = openCore(dbPath);

    expect(core.listSavedQuestions(candidate.id)).toEqual([question]);
    expect(core.markSavedQuestion(question!.id, "asked").mark).toBe("asked");
  });

  it("refuses a mark that is not one of the two, or an unknown question, and changes nothing", () => {
    const [question] = addAll("A?");
    core.markSavedQuestion(question!.id, "asked");

    expect(() => core.markSavedQuestion(question!.id, "maybe" as never)).toThrow(InvalidInputError);
    expect(() => core.markSavedQuestion("no-such-question", "asked")).toThrow(NotFoundError);

    expect(core.listSavedQuestions(candidate.id).map((q) => q.mark)).toEqual(["asked"]);
  });

  it("keeps the mark when the question is edited, tagged, or moved", () => {
    const interview = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const [question] = addAll("A?", "B?");
    core.markSavedQuestion(question!.id, "notAsked");

    expect(core.editSavedQuestion(question!.id, "A, again?").mark).toBe("notAsked");
    expect(core.tagSavedQuestion(question!.id, interview.id).mark).toBe("notAsked");
    core.moveSavedQuestion(question!.id, 1);

    expect(core.listSavedQuestions(candidate.id).map((q) => q.mark)).toEqual([null, "notAsked"]);
  });
});
