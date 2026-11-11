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
  core = openCore(join(dir, "test.sqlite"), {
    today: () => today,
    timeOfDay: () => "12:00",
  });
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

// Thursday at 10:00, 45 minutes each with a 15-minute break, for this many Candidates.
function thursday(count: number, overrides: Partial<InterviewPlanRequest> = {}): InterviewPlanRequest {
  return {
    date: "2026-11-12",
    firstTime: "10:00",
    minutes: 45,
    breakMinutes: 15,
    times: Array(count).fill(null),
    ...overrides,
  };
}

describe("Planning Interviews for several Candidates", () => {
  it("suggests the next working day at 10:00, 45 minutes each, with a 15-minute break", () => {
    expect(core.suggestInterviewPlan()).toEqual({
      date: "2026-11-11",
      firstTime: "10:00",
      minutes: 45,
      breakMinutes: 15,
    });
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
    // Each Interview's end, from its start and the length.
    expect(plan.slots.map((slot) => slot.end)).toEqual(["10:45", "11:45", "12:45", "13:45", "14:45", "15:45", "16:45", "17:45"]);
    // From the first start to the end of the last Interview.
    expect(plan).toMatchObject({
      date: "2026-11-12",
      from: "10:00",
      to: "17:45",
      refused: 0,
    });
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

  it("marks a typed time that a later Candidate's time reaches once a Candidate before them is unticked", () => {
    // Ticked: three Candidates, the second with 11:00 typed, which is also the time of its place.
    expect(core.planInterviewTimes(thursday(3, { times: [null, "11:00", null] })).slots.map((slot) => slot.sharesTime)).toEqual([
      false,
      false,
      false,
    ]);

    // The first is unticked: the typed time stays, and the third moves up to 11:00.
    const plan = core.planInterviewTimes(thursday(2, { times: ["11:00", null] }));

    expect(plan.slots.map((slot) => [slot.time, slot.sharesTime])).toEqual([
      ["11:00", true],
      ["11:00", true],
    ]);
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
    // An Interview that does not end on the day has no end.
    expect(plan.slots.map((slot) => slot.end)).toEqual(["22:15", "23:15", null, null]);
    expect(plan).toMatchObject({ from: "21:30", to: "23:15", refused: 2 });
  });

  it("allows an Interview that ends exactly at midnight", () => {
    const plan = core.planInterviewTimes(thursday(1, { firstTime: "23:15" }));

    expect(plan.slots[0]).toMatchObject({
      time: "23:15",
      end: "24:00",
      refusal: null,
    });
    expect(plan.to).toBe("24:00");
  });

  it("refuses a time typed by hand that would not end by midnight", () => {
    const plan = core.planInterviewTimes(thursday(2, { times: ["23:30", null] }));

    expect(plan.slots.map((slot) => [slot.time, slot.refusal])).toEqual([
      ["23:30", "afterMidnight"],
      ["11:00", null],
    ]);
  });

  it("refuses every Interview on a day before today: an Interview that is over is recorded on the Candidate's page", () => {
    const plan = core.planInterviewTimes(thursday(2, { date: "2026-11-09" }));

    expect(plan.slots.map((slot) => slot.refusal)).toEqual(["past", "past"]);
    expect(plan).toMatchObject({ from: null, to: null, refused: 2 });
  });

  it("refuses the Interviews today that start at or before the time now, typed or not", () => {
    // It is 12:00 on Tuesday 10 November.
    const plan = core.planInterviewTimes(
      thursday(5, {
        date: "2026-11-10",
        times: [null, null, null, null, "09:00"],
      }),
    );

    expect(plan.slots.map((slot) => [slot.time, slot.refusal])).toEqual([
      ["10:00", "past"],
      ["11:00", "past"],
      // Starting exactly now is already too late to plan.
      ["12:00", "past"],
      ["13:00", null],
      ["09:00", "past"],
    ]);
    expect(plan).toMatchObject({ from: "13:00", to: "13:45", refused: 4 });
  });

  it("refuses nothing as past on a later day, whatever the time now", () => {
    const late = openCore(join(dir, "late.sqlite"), {
      today: () => "2026-11-10",
      timeOfDay: () => "23:59",
    });
    try {
      expect(late.planInterviewTimes(thursday(1, { date: "2026-11-11", firstTime: "00:00" })).slots[0]!.refusal).toBeNull();
    } finally {
      late.close();
    }
  });

  it("treats a blank typed time as not typed", () => {
    const plan = core.planInterviewTimes(thursday(2, { times: [null, "  "] }));

    expect(plan.slots[1]).toMatchObject({ time: "11:00", typed: false });
  });

  it("gives no times, and no range, when no Candidate is chosen", () => {
    expect(core.planInterviewTimes(thursday(0))).toEqual({
      date: "2026-11-12",
      slots: [],
      from: null,
      to: null,
      refused: 0,
    });
  });

  it("refuses a day, a first time, a length, a break, or a typed time it cannot read", () => {
    const refusals: [Partial<InterviewPlanRequest>, string][] = [
      [{ date: "" }, "date"],
      [{ date: "2026-02-30" }, "date"],
      [{ firstTime: "" }, "firstTime"],
      [{ firstTime: "24:00" }, "firstTime"],
      [{ minutes: 0 }, "minutes"],
      [{ minutes: 12.5 }, "minutes"],
      [{ minutes: Number.POSITIVE_INFINITY }, "minutes"],
      [{ minutes: 24 * 60 + 1 }, "minutes"],
      [{ breakMinutes: -5 }, "breakMinutes"],
      [{ breakMinutes: Number.NaN }, "breakMinutes"],
      [{ times: ["9:5"] }, "time"],
      [{ times: undefined as never }, "times"],
      [{ times: "10:00" as never }, "times"],
      [{ times: [10] as never }, "times"],
      [{ times: Array(501).fill(null) }, "times"],
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

  it("plans up to 500 Interviews at once", () => {
    const plan = core.planInterviewTimes(thursday(500, { firstTime: "00:00", minutes: 1, breakMinutes: 0 }));

    expect(plan.slots).toHaveLength(500);
    expect(plan.refused).toBe(0);
  });

  it("saves nothing: the plan is only a proposal until each Interview is added", () => {
    const candidate = core.createCandidate({
      name: "Ada Demir",
      role: "Backend Engineer",
    });

    const plan = core.planInterviewTimes(thursday(1));

    expect(core.listInterviews(candidate.id)).toEqual([]);
    const added = core.addInterview({
      candidateId: candidate.id,
      date: plan.date,
      time: plan.slots[0]!.time,
    });
    expect(added).toMatchObject({
      date: "2026-11-12",
      time: "10:00",
      planned: true,
    });
    expect(core.getCandidateOverview(candidate.id).noInterviewYet).toBe(false);
  });
});
