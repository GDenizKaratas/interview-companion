import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError, NotFoundError, openCore, type Candidate, type Core } from "./index.ts";

let dir: string;
let dbPath: string;
let core: Core;
let candidate: Candidate;
// The clock core reads when a note is saved. Each test moves it forward by hand.
let clock: Date;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  dbPath = join(dir, "test.sqlite");
  clock = new Date("2026-11-10T14:02:00.000Z");
  core = openCore(dbPath, { today: () => "2026-11-10", now: () => clock });
  candidate = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Interviewer Notes", () => {
  it("lists a note after it is added, with the time it was saved", () => {
    const [note] = core.addInterviewerNotes({ candidateId: candidate.id, text: "Ask about idempotency" });

    expect(note).toMatchObject({
      candidateId: candidate.id,
      interviewId: null,
      text: "Ask about idempotency",
      savedAt: "2026-11-10T14:02:00.000Z",
    });
    expect(core.listInterviewerNotes(candidate.id)).toEqual([note]);
  });

  it("saves each line of a pasted text as its own note, skipping blank lines and trimming spaces", () => {
    const added = core.addInterviewerNotes({
      candidateId: candidate.id,
      text: "  Interesting Redis example \r\n\n   \nCheck scale of last project\n",
    });

    expect(added.map((note) => note.text)).toEqual(["Interesting Redis example", "Check scale of last project"]);
    expect(core.listInterviewerNotes(candidate.id).map((note) => note.text)).toEqual([
      "Interesting Redis example",
      "Check scale of last project",
    ]);
  });

  it("refuses a note with no text and saves nothing", () => {
    for (const text of ["", "   ", "\n \n"]) {
      expect(() => core.addInterviewerNotes({ candidateId: candidate.id, text })).toThrow(
        expect.objectContaining({ field: "text", rule: "required" }),
      );
    }

    expect(core.listInterviewerNotes(candidate.id)).toEqual([]);
  });

  it("lists the newest save first, keeping the lines of one paste in their order", () => {
    core.addInterviewerNotes({ candidateId: candidate.id, text: "Written first" });
    clock = new Date("2026-11-10T14:10:00.000Z");
    core.addInterviewerNotes({ candidateId: candidate.id, text: "Pasted line one\nPasted line two" });
    clock = new Date("2026-11-10T14:20:00.000Z");
    core.addInterviewerNotes({ candidateId: candidate.id, text: "Written last" });

    expect(core.listInterviewerNotes(candidate.id).map((note) => note.text)).toEqual([
      "Written last",
      "Pasted line one",
      "Pasted line two",
      "Written first",
    ]);
  });

  it("lists only the notes of the Candidate asked for", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const mine = core.addInterviewerNotes({ candidateId: candidate.id, text: "Mine" });
    core.addInterviewerNotes({ candidateId: other.id, text: "Not mine" });

    expect(core.listInterviewerNotes(candidate.id)).toEqual(mine);
  });

  it("tags a new note with an Interview of the same Candidate", () => {
    const interview = core.addInterview({ candidateId: candidate.id });

    const [note] = core.addInterviewerNotes({ candidateId: candidate.id, interviewId: interview.id, text: "Tagged" });

    expect(note!.interviewId).toBe(interview.id);
    expect(core.listInterviewerNotes(candidate.id)).toEqual([note]);
  });

  it("refuses a tag with an Interview that does not exist or belongs to another Candidate", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const othersInterview = core.addInterview({ candidateId: other.id });

    for (const interviewId of ["no-such-id", othersInterview.id]) {
      expect(() => core.addInterviewerNotes({ candidateId: candidate.id, interviewId, text: "Note" })).toThrow(
        NotFoundError,
      );
    }
    expect(core.listInterviewerNotes(candidate.id)).toEqual([]);
  });

  it("refuses to add or list notes for a Candidate that does not exist", () => {
    expect(() => core.addInterviewerNotes({ candidateId: "no-such-id", text: "Note" })).toThrow(NotFoundError);
    expect(() => core.listInterviewerNotes("no-such-id")).toThrow(NotFoundError);
  });

  it("refuses to list notes for an Interview that does not exist or belongs to another Candidate", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const othersInterview = core.addInterview({ candidateId: other.id });

    for (const interviewId of ["no-such-id", othersInterview.id]) {
      expect(() => core.listInterviewerNotes(candidate.id, { interviewId })).toThrow(NotFoundError);
    }
  });

  it("lists, for one Interview, the notes tagged with it and the untagged notes", () => {
    const first = core.addInterview({ candidateId: candidate.id });
    const second = core.addInterview({ candidateId: candidate.id });
    core.addInterviewerNotes({ candidateId: candidate.id, text: "Untagged" });
    clock = new Date("2026-11-10T14:10:00.000Z");
    core.addInterviewerNotes({ candidateId: candidate.id, interviewId: first.id, text: "About the first" });
    clock = new Date("2026-11-10T14:20:00.000Z");
    core.addInterviewerNotes({ candidateId: candidate.id, interviewId: second.id, text: "About the second" });

    expect(core.listInterviewerNotes(candidate.id, { interviewId: first.id }).map((note) => note.text)).toEqual([
      "About the first",
      "Untagged",
    ]);
    expect(core.listInterviewerNotes(candidate.id).map((note) => note.text)).toEqual([
      "About the second",
      "About the first",
      "Untagged",
    ]);
  });

  it("edits a note's text and keeps the time it was first saved", () => {
    const [note] = core.addInterviewerNotes({ candidateId: candidate.id, text: "Ask abuot retries" });
    clock = new Date("2026-11-10T15:00:00.000Z");

    const edited = core.editInterviewerNote(note!.id, "  Ask about retries ");

    expect(edited).toEqual({ ...note, text: "Ask about retries" });
    expect(core.listInterviewerNotes(candidate.id)).toEqual([edited]);
  });

  it("keeps an edited note as one note, joining its lines with spaces", () => {
    const [note] = core.addInterviewerNotes({ candidateId: candidate.id, text: "Ask about" });

    expect(core.editInterviewerNote(note!.id, "Ask about\r\n\n retries").text).toBe("Ask about retries");
  });

  it("refuses to edit a note to no text, or a note that does not exist", () => {
    const [note] = core.addInterviewerNotes({ candidateId: candidate.id, text: "Keep me" });

    expect(() => core.editInterviewerNote(note!.id, " \n ")).toThrow(InvalidInputError);
    expect(() => core.editInterviewerNote("no-such-id", "Text")).toThrow(NotFoundError);
    expect(core.listInterviewerNotes(candidate.id)).toEqual([note]);
  });

  it("changes a note's Interview tag later, or removes it", () => {
    const first = core.addInterview({ candidateId: candidate.id });
    const second = core.addInterview({ candidateId: candidate.id });
    const [note] = core.addInterviewerNotes({ candidateId: candidate.id, interviewId: first.id, text: "Typed in later" });

    const moved = core.tagInterviewerNote(note!.id, second.id);
    expect(moved).toEqual({ ...note, interviewId: second.id });
    expect(core.listInterviewerNotes(candidate.id, { interviewId: first.id })).toEqual([]);

    const untagged = core.tagInterviewerNote(note!.id, null);
    expect(untagged.interviewId).toBeNull();
    expect(core.listInterviewerNotes(candidate.id)).toEqual([untagged]);
  });

  it("refuses to tag a note with another Candidate's Interview, or to tag a note that does not exist", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const othersInterview = core.addInterview({ candidateId: other.id });
    const [note] = core.addInterviewerNotes({ candidateId: candidate.id, text: "Mine" });

    expect(() => core.tagInterviewerNote(note!.id, othersInterview.id)).toThrow(NotFoundError);
    expect(() => core.tagInterviewerNote("no-such-id", null)).toThrow(NotFoundError);
    expect(core.listInterviewerNotes(candidate.id)).toEqual([note]);
  });

  it("deletes a note and leaves the others", () => {
    const [keep, remove] = core.addInterviewerNotes({ candidateId: candidate.id, text: "Keep\nRemove" });

    core.deleteInterviewerNote(remove!.id);

    expect(core.listInterviewerNotes(candidate.id)).toEqual([keep]);
    expect(() => core.deleteInterviewerNote(remove!.id)).toThrow(NotFoundError);
  });

  it("keeps notes and their tags after the database is closed and opened again", () => {
    const interview = core.addInterview({ candidateId: candidate.id });
    const added = core.addInterviewerNotes({ candidateId: candidate.id, interviewId: interview.id, text: "Kept" });
    core.close();

    core = openCore(dbPath, { today: () => "2026-11-10", now: () => clock });

    expect(core.listInterviewerNotes(candidate.id)).toEqual(added);
  });
});
