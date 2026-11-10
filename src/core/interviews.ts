import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getCandidate } from "./candidates.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";

export interface Interview {
  id: string;
  candidateId: string;
  // 1 for the Candidate's first Interview, 2 for the second, in the order they were added.
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
  number: number;
  date: string | null;
  created_at: string;
}

// Today as a calendar day, YYYY-MM-DD. Core asks for it so tests can fix the day.
export type Today = () => string;

export function addInterview(db: DatabaseSync, today: Today, input: NewInterview): Interview {
  if (!getCandidate(db, input.candidateId)) {
    throw new NotFoundError("This Candidate does not exist.");
  }
  const row: InterviewRow = {
    id: randomUUID(),
    candidate_id: input.candidateId,
    number: nextNumber(db, input.candidateId),
    date: optionalDate(input.date),
    created_at: new Date().toISOString(),
  };
  db.prepare("INSERT INTO interview (id, candidate_id, number, date, created_at) VALUES (?, ?, ?, ?, ?)").run(
    row.id,
    row.candidate_id,
    row.number,
    row.date,
    row.created_at,
  );
  return toInterview(row, today());
}

// Earliest date first. Interviews without a date come last, in the order they were added.
export function listInterviews(db: DatabaseSync, today: Today, candidateId: string): Interview[] {
  const rows = db
    .prepare(
      `SELECT id, candidate_id, number, date, created_at FROM interview
       WHERE candidate_id = ?
       ORDER BY date IS NULL, date, number`,
    )
    .all(candidateId) as unknown as InterviewRow[];
  const day = today();
  return rows.map((row) => toInterview(row, day));
}

function nextNumber(db: DatabaseSync, candidateId: string): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM interview WHERE candidate_id = ?")
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
    throw new InvalidInputError("date", "The date must be a real day, written as YYYY-MM-DD.");
  }
  return trimmed;
}

// Days written as YYYY-MM-DD sort like text, so a plain comparison tells which is later.
function toInterview(row: InterviewRow, today: string): Interview {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    number: row.number,
    date: row.date,
    planned: row.date !== null && row.date > today,
    createdAt: row.created_at,
  };
}
