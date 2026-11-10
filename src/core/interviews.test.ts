import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError, NotFoundError, openCore, type Candidate, type Core } from "./index.ts";

const today = "2026-11-10";

let dir: string;
let dbPath: string;
let core: Core;
let candidate: Candidate;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  dbPath = join(dir, "test.sqlite");
  core = openCore(dbPath, { today: () => today });
  candidate = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Interviews", () => {
  it("lists an Interview after it is added to a Candidate", () => {
    const added = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });

    expect(core.listInterviews(candidate.id)).toEqual([added]);
    expect(added.candidateId).toBe(candidate.id);
    expect(added.date).toBe("2026-11-03");
  });

  it("numbers a Candidate's Interviews in the order they are added", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });

    const first = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const second = core.addInterview({ candidateId: candidate.id });
    const othersFirst = core.addInterview({ candidateId: other.id });
    const third = core.addInterview({ candidateId: candidate.id, date: "2026-11-20" });

    expect([first.number, second.number, third.number]).toEqual([1, 2, 3]);
    expect(othersFirst.number).toBe(1);
  });

  it("lists several Interviews of one Candidate, earliest date first and undated ones last", () => {
    const later = core.addInterview({ candidateId: candidate.id, date: "2026-11-20" });
    const undatedA = core.addInterview({ candidateId: candidate.id });
    const earlier = core.addInterview({ candidateId: candidate.id, date: "2026-10-28" });
    const undatedB = core.addInterview({ candidateId: candidate.id, date: null });

    expect(core.listInterviews(candidate.id).map((i) => i.id)).toEqual([
      earlier.id,
      later.id,
      undatedA.id,
      undatedB.id,
    ]);
    expect(undatedA.date).toBeNull();
  });

  it("lists only the Interviews of the Candidate asked for", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const mine = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    core.addInterview({ candidateId: other.id, date: "2026-11-03" });

    expect(core.listInterviews(candidate.id)).toEqual([mine]);
  });

  it("keeps Interviews after the database is closed and opened again", () => {
    const added = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    core.close();

    core = openCore(dbPath, { today: () => today });

    expect(core.listInterviews(candidate.id)).toEqual([added]);
  });

  it("marks an Interview as planned only when its date is after today", () => {
    const tomorrow = core.addInterview({ candidateId: candidate.id, date: "2026-11-11" });
    const onToday = core.addInterview({ candidateId: candidate.id, date: today });
    const past = core.addInterview({ candidateId: candidate.id, date: "2026-11-03" });
    const undated = core.addInterview({ candidateId: candidate.id });

    expect([tomorrow.planned, onToday.planned, past.planned, undated.planned]).toEqual([true, false, false, false]);
  });

  it("treats a blank date as no date", () => {
    const added = core.addInterview({ candidateId: candidate.id, date: "  " });

    expect(added.date).toBeNull();
  });

  it("refuses a date that is not a real YYYY-MM-DD day and saves nothing", () => {
    for (const date of ["03.11.2026", "2026-11-3", "2026-02-30", "2026-13-01", "tomorrow"]) {
      expect(() => core.addInterview({ candidateId: candidate.id, date })).toThrow(InvalidInputError);
    }

    expect(core.listInterviews(candidate.id)).toEqual([]);
  });

  it("accepts the 29th of February in a leap year", () => {
    const added = core.addInterview({ candidateId: candidate.id, date: "2028-02-29" });

    expect(added.date).toBe("2028-02-29");
  });

  it("refuses to add or list Interviews for a Candidate that does not exist", () => {
    expect(() => core.addInterview({ candidateId: "no-such-id" })).toThrow(NotFoundError);
    expect(() => core.listInterviews("no-such-id")).toThrow(NotFoundError);
  });
});
