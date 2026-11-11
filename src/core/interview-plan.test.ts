import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError, openCore, type Core, type InterviewPlanRequest } from "./index.ts";

let dir: string;
let core: Core;
// Tuesday 10 November 2026, unless a test opens core on another day.
let today = "2026-11-10";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  today = "2026-11-10";
  core = openCore(join(dir, "test.sqlite"), { today: () => today, timeOfDay: () => "12:00" });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

// Thursday at 10:00, 45 minutes each with a 15-minute break, for this many Candidates.
function thursday(count: number, overrides: Partial<InterviewPlanRequest> = {}): InterviewPlanRequest {
  return { date: "2026-11-12", firstTime: "10:00", minutes: 45, breakMinutes: 15, times: Array(count).fill(null), ...overrides };
}

describe("Planning Interviews for several Candidates", () => {
  it("suggests the next working day at 10:00, 45 minutes each, with a 15-minute break", () => {
    expect(core.suggestInterviewPlan()).toEqual({ date: "2026-11-11", firstTime: "10:00", minutes: 45, breakMinutes: 15 });
  });

  it("suggests the Monday after a Friday, a Saturday, or a Sunday", () => {
    for (const day of ["2026-11-13", "2026-11-14", "2026-11-15"]) {
      today = day;
      expect(core.suggestInterviewPlan().date, day).toBe("2026-11-16");
    }
  });

  it("gives each Interview the length and the break after the one before, from the first time", () => {
    const plan = core.planInterviewTimes(thursday(8));

    expect(plan.slots.map((slot) => slot.time)).toEqual(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
    expect(plan.slots.every((slot) => !slot.typed && !slot.sharesTime && slot.refusal === null)).toBe(true);
    // From the first start to the end of the last Interview.
    expect(plan).toMatchObject({ date: "2026-11-12", from: "10:00", to: "17:45", refused: 0 });
  });

  it("follows minutes that do not add up to whole hours", () => {
    const plan = core.planInterviewTimes(thursday(3, { firstTime: "09:30", minutes: 50, breakMinutes: 0 }));

    expect(plan.slots.map((slot) => slot.time)).toEqual(["09:30", "10:20", "11:10"]);
    expect(plan.to).toBe("12:00");
  });

  it("keeps a time typed by hand, and the others keep the times of their places", () => {
    const plan = core.planInterviewTimes(thursday(3, { times: [null, "15:30", null] }));

    expect(plan.slots.map((slot) => [slot.time, slot.typed])).toEqual([
      ["10:00", false],
      ["15:30", true],
      ["12:00", false],
    ]);
    expect(plan).toMatchObject({ from: "10:00", to: "16:15" });
  });

  it("allows two Interviews at the same time, and marks both", () => {
    const plan = core.planInterviewTimes(thursday(3, { times: [null, "10:00", null] }));

    expect(plan.slots.map((slot) => slot.sharesTime)).toEqual([true, true, false]);
    expect(plan.refused).toBe(0);
  });

  it("refuses the Interviews that would not end by midnight, and says why", () => {
    const plan = core.planInterviewTimes(thursday(4, { firstTime: "21:30" }));

    expect(plan.slots.map((slot) => [slot.time, slot.refusal])).toEqual([
      ["21:30", null],
      ["22:30", null],
      // Starts on the day but would end at 00:15 the next day.
      ["23:30", "afterMidnight"],
      // Would start on the next day, so it has no time on this one.
      [null, "afterMidnight"],
    ]);
    expect(plan).toMatchObject({ from: "21:30", to: "23:15", refused: 2 });
  });

  it("allows an Interview that ends exactly at midnight", () => {
    const plan = core.planInterviewTimes(thursday(1, { firstTime: "23:15" }));

    expect(plan.slots[0]).toMatchObject({ time: "23:15", refusal: null });
    expect(plan.to).toBe("24:00");
  });

  it("refuses a time typed by hand that would not end by midnight", () => {
    const plan = core.planInterviewTimes(thursday(2, { times: ["23:30", null] }));

    expect(plan.slots.map((slot) => [slot.time, slot.refusal])).toEqual([
      ["23:30", "afterMidnight"],
      ["11:00", null],
    ]);
  });

  it("treats a blank typed time as not typed", () => {
    const plan = core.planInterviewTimes(thursday(2, { times: [null, "  "] }));

    expect(plan.slots[1]).toMatchObject({ time: "11:00", typed: false });
  });

  it("gives no times, and no range, when no Candidate is chosen", () => {
    expect(core.planInterviewTimes(thursday(0))).toEqual({ date: "2026-11-12", slots: [], from: null, to: null, refused: 0 });
  });

  it("refuses a day, a first time, a length, a break, or a typed time it cannot read", () => {
    const refusals: [Partial<InterviewPlanRequest>, string][] = [
      [{ date: "" }, "date"],
      [{ date: "2026-02-30" }, "date"],
      [{ firstTime: "" }, "firstTime"],
      [{ firstTime: "24:00" }, "firstTime"],
      [{ minutes: 0 }, "minutes"],
      [{ minutes: 12.5 }, "minutes"],
      [{ minutes: 24 * 60 + 1 }, "minutes"],
      [{ breakMinutes: -5 }, "breakMinutes"],
      [{ breakMinutes: Number.NaN }, "breakMinutes"],
      [{ times: ["9:5"] }, "time"],
    ];
    for (const [overrides, field] of refusals) {
      expect(() => core.planInterviewTimes(thursday(1, overrides)), field).toThrow(InvalidInputError);
      try {
        core.planInterviewTimes(thursday(1, overrides));
      } catch (error) {
        expect((error as InvalidInputError).field, JSON.stringify(overrides)).toBe(field);
      }
    }
  });

  it("saves nothing: the plan is only a proposal until each Interview is added", () => {
    const candidate = core.createCandidate({ name: "Ada Demir", role: "Backend Engineer" });

    const plan = core.planInterviewTimes(thursday(1));

    expect(core.listInterviews(candidate.id)).toEqual([]);
    const added = core.addInterview({ candidateId: candidate.id, date: plan.date, time: plan.slots[0]!.time });
    expect(added).toMatchObject({ date: "2026-11-12", time: "10:00", planned: true });
    expect(core.getCandidateOverview(candidate.id).noInterviewYet).toBe(false);
  });
});
