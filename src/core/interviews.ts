import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getCandidate } from "./candidates.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";
import { existingSpelling, sortLabels, tidyLabel } from "./labels.ts";

export interface Interview {
  id: string;
  candidateId: string;
  stage: string;
  // A calendar day, YYYY-MM-DD, or null when the Interview has no date yet.
  date: string | null;
  createdAt: string;
}

export interface NewInterview {
  candidateId: string;
  stage: string;
  date?: string | null;
}

interface InterviewRow {
  id: string;
  candidate_id: string;
  stage: string;
  date: string | null;
  created_at: string;
}

export function addInterview(db: DatabaseSync, input: NewInterview): Interview {
  if (!getCandidate(db, input.candidateId)) {
    throw new NotFoundError("This Candidate does not exist.");
  }
  const interview: Interview = {
    id: randomUUID(),
    candidateId: input.candidateId,
    stage: existingSpelling(stagesInOrderWritten(db), requireStage(input.stage)),
    date: optionalDate(input.date),
    createdAt: new Date().toISOString(),
  };
  db.prepare("INSERT INTO interview (id, candidate_id, stage, date, created_at) VALUES (?, ?, ?, ?, ?)").run(
    interview.id,
    interview.candidateId,
    interview.stage,
    interview.date,
    interview.createdAt,
  );
  return interview;
}

// Earliest date first. Interviews without a date come last, in the order they were added.
export function listInterviews(db: DatabaseSync, candidateId: string): Interview[] {
  const rows = db
    .prepare(
      `SELECT id, candidate_id, stage, date, created_at FROM interview
       WHERE candidate_id = ?
       ORDER BY date IS NULL, date, rowid`,
    )
    .all(candidateId);
  return (rows as unknown as InterviewRow[]).map(toInterview);
}

// Every stage used so far, for any Candidate, once each, in alphabetical order.
// Suggested when an Interview is added.
export function listInterviewStages(db: DatabaseSync): string[] {
  return sortLabels(stagesInOrderWritten(db));
}

function stagesInOrderWritten(db: DatabaseSync): string[] {
  const rows = db
    .prepare("SELECT stage FROM interview GROUP BY stage ORDER BY MIN(rowid)")
    .all() as unknown as { stage: string }[];
  return rows.map((row) => row.stage);
}

function requireStage(value: string): string {
  const tidy = tidyLabel(value);
  if (tidy === "") {
    throw new InvalidInputError("stage", "An Interview needs a stage.");
  }
  return tidy;
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

function toInterview(row: InterviewRow): Interview {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    stage: row.stage,
    date: row.date,
    createdAt: row.created_at,
  };
}
