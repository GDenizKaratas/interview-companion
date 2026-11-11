import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { requireCandidate } from "./candidates.ts";
import { inTransaction } from "./database.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";

export interface Interview {
  id: string;
  candidateId: string;
  // The Interview's place among the Candidate's Interviews: 1 for the earliest date. Interviews
  // without a date come after the dated ones, in the order they were added. Adding an Interview
  // with an earlier date moves the later ones up by one.
  number: number;
  // A calendar day, YYYY-MM-DD, or null when the Interview has no date yet.
  date: string | null;
  // The time of day the Interview starts, HH:MM on a 24-hour clock, or null when none was given.
  // Only an Interview with a date has a time.
  time: string | null;
  // True when the Interview has not happened yet: its date is after today, or it is today with
  // a time that is still ahead. An Interview today without a time has taken place.
  planned: boolean;
  createdAt: string;
}

// When an Interview is. A date or time that is left out, null, or blank means there is none.
export interface InterviewTime {
  date?: string | null;
  time?: string | null;
}

export interface NewInterview extends InterviewTime {
  candidateId: string;
}

interface InterviewRow {
  id: string;
  candidate_id: string;
  added_order: number;
  date: string | null;
  time: string | null;
  created_at: string;
}

// Today as a calendar day, YYYY-MM-DD, and the time now as HH:MM, both on the Interviewer's
// computer. Core asks for them so tests can fix the day and the time.
export type Today = () => { day: string; time: string };

export function addInterview(db: DatabaseSync, today: Today, input: NewInterview): Interview {
  requireCandidate(db, input.candidateId);
  const { date, time } = dateAndTime(input);
  const id = randomUUID();
  // The order is read and used in one transaction, so two Interviews never get the same one.
  inTransaction(db, () => {
    db.prepare("INSERT INTO interview (id, candidate_id, added_order, date, time, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      input.candidateId,
      nextAddedOrder(db, input.candidateId),
      date,
      time,
      new Date().toISOString(),
    );
  });
  // The new Interview's number depends on the dates of the others, so it is read from the
  // same list that numbers them, instead of being worked out a second time here.
  return listInterviews(db, today, input.candidateId).find((interview) => interview.id === id)!;
}

// Earliest date first, and within a day earliest time first; Interviews of that day without a
// time follow. Interviews without a date come last. Ties keep the order they were added.
export function listInterviews(db: DatabaseSync, today: Today, candidateId: string): Interview[] {
  requireCandidate(db, candidateId);
  const rows = db
    .prepare(
      `SELECT id, candidate_id, added_order, date, time, created_at FROM interview
       WHERE candidate_id = ?
       ORDER BY date IS NULL, date, time IS NULL, time, added_order`,
    )
    .all(candidateId) as unknown as InterviewRow[];
  const now = today();
  return rows.map((row, index) => toInterview(row, index + 1, now));
}

// Sets when the Interview is. Both parts are replaced: a date or time left out is removed, as
// a blank one is, so the caller always gives the whole new date and time.
export function rescheduleInterview(db: DatabaseSync, today: Today, interviewId: string, input: InterviewTime): Interview {
  const candidateId = candidateOfInterview(db, interviewId);
  const { date, time } = dateAndTime(input);
  db.prepare("UPDATE interview SET date = ?, time = ? WHERE id = ?").run(date, time, interviewId);
  return listInterviews(db, today, candidateId).find((interview) => interview.id === interviewId)!;
}

// Deletes the Interview with its Transcript and everything made from that Transcript: its AI
// Notes, its Asked Questions, and the Suggested Questions that quote it. Interviewer Notes and
// Saved Questions tagged with the Interview stay with the Candidate and lose the tag. The
// database's foreign keys do all of this.
export function deleteInterview(db: DatabaseSync, interviewId: string): void {
  requireInterview(db, interviewId);
  db.prepare("DELETE FROM interview WHERE id = ?").run(interviewId);
}

// The Interview the Workspace opens on: the latest one that has taken place; when none has, the
// earliest Planned one; when none is dated, the first one. null when the Candidate has none.
// "Latest" follows the order of listInterviews, so on one day an Interview without a time
// counts as later than the timed ones.
export function getDefaultInterview(db: DatabaseSync, today: Today, candidateId: string): Interview | null {
  const interviews = listInterviews(db, today, candidateId);
  return interviews.findLast(hasTakenPlace) ?? interviews.find((interview) => interview.planned) ?? interviews[0] ?? null;
}

// True for an Interview with a date that is not Planned. One without a date is neither.
export function hasTakenPlace(interview: Interview): boolean {
  return interview.date !== null && !interview.planned;
}

// Refuses with NotFoundError unless the Interview exists.
export function requireInterview(db: DatabaseSync, interviewId: string): void {
  if (!db.prepare("SELECT 1 FROM interview WHERE id = ?").get(interviewId)) {
    throw new NotFoundError("This Interview does not exist.");
  }
}

// The Candidate an Interview belongs to. Refuses with NotFoundError when it does not exist.
export function candidateOfInterview(db: DatabaseSync, interviewId: string): string {
  const row = db.prepare("SELECT candidate_id FROM interview WHERE id = ?").get(interviewId) as { candidate_id: string } | undefined;
  if (!row) throw new NotFoundError("This Interview does not exist.");
  return row.candidate_id;
}

// Refuses with NotFoundError unless the Interview exists and belongs to this Candidate.
export function requireInterviewOf(db: DatabaseSync, candidateId: string, interviewId: string): void {
  const row = db.prepare("SELECT 1 FROM interview WHERE id = ? AND candidate_id = ?").get(interviewId, candidateId);
  if (!row) {
    throw new NotFoundError("This Interview does not exist for this Candidate.");
  }
}

// The Interview filter of the Workspace, shared by Interviewer Notes and Saved Questions.
export interface InterviewFilter {
  // Show only what is tagged with this Interview, and what is tagged with no Interview. Omit for all.
  interviewId?: string | null;
}

// The one place the Interview filter rule is written. Refuses an Interview of another Candidate,
// and gives the SQL condition on an interview_id column with its parameters.
export function interviewFilterCondition(
  db: DatabaseSync,
  candidateId: string,
  filter: InterviewFilter,
): { sql: string; params: (string | null)[] } {
  const interviewId = filter.interviewId ?? null;
  if (interviewId !== null) requireInterviewOf(db, candidateId, interviewId);
  return { sql: "(? IS NULL OR interview_id IS NULL OR interview_id = ?)", params: [interviewId, interviewId] };
}

function nextAddedOrder(db: DatabaseSync, candidateId: string): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(added_order), 0) + 1 AS next FROM interview WHERE candidate_id = ?")
    .get(candidateId) as { next: number };
  return row.next;
}

// A blank date means the Interview has no date yet. Any other value must be a real
// calendar day written as YYYY-MM-DD, so "2026-02-30" is refused.
function optionalDate(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const day = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : undefined;
  if (!day || day.toISOString().slice(0, 10) !== trimmed) {
    throw new InvalidInputError("date", "format", "The date must be a real day, written as YYYY-MM-DD.");
  }
  return trimmed;
}

// A blank time means no time was given. Any other value must be HH:MM on a 24-hour clock.
function optionalTime(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    throw new InvalidInputError("time", "format", "The time must be written as HH:MM, from 00:00 to 23:59.");
  }
  return trimmed;
}

// The date and time of an Interview as given. A time is refused without a date, because it
// would say nothing about when the Interview is.
function dateAndTime(input: InterviewTime): { date: string | null; time: string | null } {
  const date = optionalDate(input.date);
  const time = optionalTime(input.time);
  if (time !== null && date === null) {
    throw new InvalidInputError("date", "required", "An Interview with a time needs a date.");
  }
  return { date, time };
}

// Marks the row as Planned or not. Days written as YYYY-MM-DD, and times written as HH:MM, sort
// like text, so a plain comparison tells which is later.
function toInterview(row: InterviewRow, number: number, now: { day: string; time: string }): Interview {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    number,
    date: row.date,
    time: row.time,
    planned: row.date !== null && (row.date > now.day || (row.date === now.day && row.time !== null && row.time > now.time)),
    createdAt: row.created_at,
  };
}
