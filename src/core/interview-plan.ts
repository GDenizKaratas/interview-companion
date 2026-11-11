import { InvalidInputError } from "./errors.ts";
import { optionalDate, optionalTime, type Today } from "./interviews.ts";

// Planning Interviews for several Candidates at once: one day, a first time, a length and a break.
// This only works out the times; nothing is saved until each Interview is added with addInterview.

export interface InterviewPlanSettings {
  // The day of every Interview of the plan, YYYY-MM-DD.
  date: string;
  // The start of the first Interview, HH:MM.
  firstTime: string;
  // The length of each Interview, in whole minutes.
  minutes: number;
  // The break between one Interview's end and the next one's start, in whole minutes.
  breakMinutes: number;
}

export interface InterviewPlanRequest extends InterviewPlanSettings {
  // One entry per Interview, in the order the Candidates were chosen: a time typed by hand, or
  // null (or blank) for the time of its place in the order. At most maxPlannedInterviews entries.
  times: (string | null)[];
}

// The most Interviews one plan can hold. Far more than a day can fit; it only keeps a request small.
export const maxPlannedInterviews = 500;

// Why an Interview of the plan cannot be added on its day: it would not end by midnight, or it
// would start at or before the time now. An Interview that is over is recorded on the
// Candidate's own page, not planned.
export type SlotRefusal = "afterMidnight" | "past";

export interface PlannedSlot {
  // The start, HH:MM, or null when the time of its place would fall on the next day.
  time: string | null;
  // The end, HH:MM, which may be "24:00"; null when the Interview would not end on its day.
  end: string | null;
  // The time was typed by hand.
  typed: boolean;
  // Another Interview of the plan starts at the same time. Allowed, only pointed out.
  sharesTime: boolean;
  // null when the Interview fits on the day.
  refusal: SlotRefusal | null;
}

export interface InterviewPlan {
  date: string;
  slots: PlannedSlot[];
  // The earliest start and the latest end of the Interviews that fit, HH:MM; the end may be
  // "24:00". null when none fits.
  from: string | null;
  to: string | null;
  // How many Interviews do not fit on the day.
  refused: number;
}

const dayMinutes = 24 * 60;

// What the plan starts from: the next working day (Monday to Friday) at 10:00, 45 minutes each
// with a 15-minute break. Public holidays are not known.
export function suggestInterviewPlan(today: Today): InterviewPlanSettings {
  const date = new Date(`${today().day}T00:00:00Z`);
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return {
    date: date.toISOString().slice(0, 10),
    firstTime: "10:00",
    minutes: 45,
    breakMinutes: 15,
  };
}

// The time of each Interview: the one at place i starts at the first time plus i times the
// length and the break, unless a time was typed for it. A typed time does not move the others.
// An Interview that would not end by midnight is refused, since the plan is for one day; so is one
// that would start at or before the time now on the Interviewer's computer.
export function planInterviewTimes(today: Today, input: InterviewPlanRequest): InterviewPlan {
  const date = required("date", () => optionalDate(input.date), "The plan needs a day, written as YYYY-MM-DD.");
  const firstTime = required("firstTime", () => optionalTime(input.firstTime), "The plan needs a first time, written as HH:MM.");
  const minutes = wholeMinutes("minutes", input.minutes, 1, "Each Interview must last from 1 minute to 24 hours, in whole minutes.");
  const breakMinutes = wholeMinutes("breakMinutes", input.breakMinutes, 0, "The break must be 0 or more whole minutes, up to 24 hours.");
  const times = typedTimes(input.times);
  const first = toMinutes(firstTime);
  const now = today();
  // Every start at or before this minute of the day is past: all of them on a day before today.
  const pastUntil = date < now.day ? dayMinutes : date === now.day ? toMinutes(now.time) : -1;
  const starts = times.map((typed, place) => {
    const time = optionalTime(typed);
    return time === null ? { start: first + place * (minutes + breakMinutes), typed: false } : { start: toMinutes(time), typed: true };
  });
  const slots = starts.map(({ start, typed }) => ({
    time: start < dayMinutes ? toTime(start) : null,
    end: start + minutes <= dayMinutes ? toTime(start + minutes) : null,
    typed,
    sharesTime: starts.filter((other) => other.start === start).length > 1,
    refusal: start <= pastUntil ? ("past" as const) : start + minutes > dayMinutes ? ("afterMidnight" as const) : null,
  }));
  const fitting = starts.filter((_, i) => slots[i]!.refusal === null).map(({ start }) => start);
  return {
    date,
    slots,
    from: fitting.length > 0 ? toTime(Math.min(...fitting)) : null,
    to: fitting.length > 0 ? toTime(Math.max(...fitting) + minutes) : null,
    refused: slots.length - fitting.length,
  };
}

// The typed times as sent: a list of at most maxPlannedInterviews entries, each a time or null.
function typedTimes(times: unknown): (string | null)[] {
  const message = `The plan needs a list of up to ${maxPlannedInterviews} times, each a time written as HH:MM or left empty.`;
  if (!Array.isArray(times) || times.length > maxPlannedInterviews) throw new InvalidInputError("times", "format", message);
  if (!times.every((time) => time === null || typeof time === "string")) throw new InvalidInputError("times", "format", message);
  return times as (string | null)[];
}

// A value that must be given: blank is refused, and a refusal names this field.
function required(field: string, read: () => string | null, message: string): string {
  let value: string | null;
  try {
    value = read();
  } catch (error) {
    if (error instanceof InvalidInputError) throw new InvalidInputError(field, error.rule, message);
    throw error;
  }
  if (value === null) throw new InvalidInputError(field, "required", message);
  return value;
}

function wholeMinutes(field: string, value: number, least: number, message: string): number {
  if (!Number.isInteger(value) || value < least || value > dayMinutes) throw new InvalidInputError(field, "format", message);
  return value;
}

function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function toTime(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
