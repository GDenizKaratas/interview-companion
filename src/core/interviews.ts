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
  // True when the date is after today: the Interview has not happened yet.
  planned: boolean;
  createdAt: string;
}

export interface NewInterview {
  candidateId: string;
  date?: string | null;
}

interface InterviewRow {
  id: string;
  candidate_id: string;
  added_order: number;
  date: string | null;
  created_at: string;
}

// Today as a calendar day, YYYY-MM-DD. Core asks for it so tests can fix the day.
export type Today = () => string;

export function addInterview(db: DatabaseSync, today: Today, input: NewInterview): Interview {
  requireCandidate(db, input.candidateId);
  const date = optionalDate(input.date);
  const id = randomUUID();
  // The order is read and used in one transaction, so two Interviews never get the same one.
  inTransaction(db, () => {
    db.prepare("INSERT INTO interview (id, candidate_id, added_order, date, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      input.candidateId,
      nextAddedOrder(db, input.candidateId),
      date,
      new Date().toISOString(),
    );
  });
  // The new Interview's number depends on the dates of the others, so it is read from the
  // same list that numbers them, instead of being worked out a second time here.
  return listInterviews(db, today, input.candidateId).find((interview) => interview.id === id)!;
}

// Earliest date first. Interviews without a date come last, in the order they were added.
export function listInterviews(db: DatabaseSync, today: Today, candidateId: string): Interview[] {
  requireCandidate(db, candidateId);
  const rows = db
    .prepare(
      `SELECT id, candidate_id, added_order, date, created_at FROM interview
       WHERE candidate_id = ?
       ORDER BY date IS NULL, date, added_order`,
    )
    .all(candidateId) as unknown as InterviewRow[];
  const day = today();
  return rows.map((row, index) => toInterview(row, index + 1, day));
}

// Refuses with NotFoundError unless the Interview exists.
export function requireInterview(db: DatabaseSync, interviewId: string): void {
  if (!db.prepare("SELECT 1 FROM interview WHERE id = ?").get(interviewId)) {
    throw new NotFoundError("This Interview does not exist.");
  }
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

// Days written as YYYY-MM-DD sort like text, so a plain comparison tells which is later.
function toInterview(row: InterviewRow, number: number, today: string): Interview {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    number,
    date: row.date,
    planned: row.date !== null && row.date > today,
    createdAt: row.created_at,
  };
}
