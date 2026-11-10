import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError, openCore, type Candidate, type Core } from "./index.ts";

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

describe("Interviews", () => {
  it("lists an Interview after it is added to a Candidate", () => {
    const added = core.addInterview({ candidateId: candidate.id, stage: "Technical", date: "2026-11-03" });

    expect(core.listInterviews(candidate.id)).toEqual([added]);
    expect(added.candidateId).toBe(candidate.id);
    expect(added.stage).toBe("Technical");
    expect(added.date).toBe("2026-11-03");
  });

  it("lists several Interviews of one Candidate, earliest date first and undated ones last", () => {
    const final = core.addInterview({ candidateId: candidate.id, stage: "Final", date: "2026-11-20" });
    const unplannedA = core.addInterview({ candidateId: candidate.id, stage: "System design" });
    const screen = core.addInterview({ candidateId: candidate.id, stage: "Phone screen", date: "2026-10-28" });
    const unplannedB = core.addInterview({ candidateId: candidate.id, stage: "Team fit", date: null });

    expect(core.listInterviews(candidate.id).map((i) => i.id)).toEqual([
      screen.id,
      final.id,
      unplannedA.id,
      unplannedB.id,
    ]);
    expect(unplannedA.date).toBeNull();
  });

  it("lists only the Interviews of the Candidate asked for", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    const mine = core.addInterview({ candidateId: candidate.id, stage: "Technical", date: "2026-11-03" });
    core.addInterview({ candidateId: other.id, stage: "Technical", date: "2026-11-03" });

    expect(core.listInterviews(candidate.id)).toEqual([mine]);
  });

  it("keeps Interviews after the database is closed and opened again", () => {
    const added = core.addInterview({ candidateId: candidate.id, stage: "Technical", date: "2026-11-03" });
    core.close();

    core = openCore(dbPath);

    expect(core.listInterviews(candidate.id)).toEqual([added]);
  });

  it("trims spaces around the stage", () => {
    const added = core.addInterview({ candidateId: candidate.id, stage: "  Technical  " });

    expect(added.stage).toBe("Technical");
  });

  it("refuses an Interview without a stage and saves nothing", () => {
    expect(() => core.addInterview({ candidateId: candidate.id, stage: "  ", date: "2026-11-03" })).toThrow(
      InvalidInputError,
    );

    expect(core.listInterviews(candidate.id)).toEqual([]);
  });

  it("treats a blank date as no date", () => {
    const added = core.addInterview({ candidateId: candidate.id, stage: "Technical", date: "  " });

    expect(added.date).toBeNull();
  });

  it("refuses a date that is not a real YYYY-MM-DD day and saves nothing", () => {
    for (const date of ["03.11.2026", "2026-11-3", "2026-02-30", "2026-13-01", "tomorrow"]) {
      expect(() => core.addInterview({ candidateId: candidate.id, stage: "Technical", date })).toThrow(
        InvalidInputError,
      );
    }

    expect(core.listInterviews(candidate.id)).toEqual([]);
  });

  it("accepts the 29th of February in a leap year", () => {
    const added = core.addInterview({ candidateId: candidate.id, stage: "Technical", date: "2028-02-29" });

    expect(added.date).toBe("2028-02-29");
  });

  it("refuses an Interview for a Candidate that does not exist", () => {
    expect(() => core.addInterview({ candidateId: "no-such-id", stage: "Technical" })).toThrow(InvalidInputError);

    expect(core.listInterviews("no-such-id")).toEqual([]);
  });

  it("lists each stage used before once, in alphabetical order, across all Candidates", () => {
    const other = core.createCandidate({ name: "Can Aksoy", role: "Data Engineer" });
    core.addInterview({ candidateId: candidate.id, stage: "Technical" });
    core.addInterview({ candidateId: other.id, stage: "Phone screen" });
    core.addInterview({ candidateId: other.id, stage: "Technical" });

    expect(core.listInterviewStages()).toEqual(["Phone screen", "Technical"]);
  });

  it("saves a stage under the existing spelling when it differs only in letter case or spaces", () => {
    core.addInterview({ candidateId: candidate.id, stage: "Phone screen" });

    const second = core.addInterview({ candidateId: candidate.id, stage: "PHONE   screen" });

    expect(second.stage).toBe("Phone screen");
    expect(core.listInterviewStages()).toEqual(["Phone screen"]);
  });

  it("matches an existing Turkish stage written in capital letters", () => {
    core.addInterview({ candidateId: candidate.id, stage: "Teknik mülakat" });

    const second = core.addInterview({ candidateId: candidate.id, stage: "TEKNİK MÜLAKAT" });

    expect(second.stage).toBe("Teknik mülakat");
  });
});
