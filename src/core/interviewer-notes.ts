import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { requireCandidate } from "./candidates.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";
import { requireInterviewOf } from "./interviews.ts";

export interface InterviewerNote {
  id: string;
  candidateId: string;
  // The Interview the note is tagged with, or null when it belongs to no Interview.
  interviewId: string | null;
  text: string;
  // When the note was saved, as ISO 8601 in UTC. Not the moment in the Interview it is about.
  savedAt: string;
}

export interface NewInterviewerNotes {
  candidateId: string;
  interviewId?: string | null;
  text: string;
}

interface NoteRow {
  id: string;
  candidate_id: string;
  interview_id: string | null;
  text: string;
  saved_at: string;
}

const columns = "id, candidate_id, interview_id, text, saved_at";

// The time a note is saved. Core asks for it so tests can fix the clock.
export type Now = () => Date;

// Each non-blank line of the text becomes one note, in the order of the lines, so a list
// typed or pasted from paper becomes one note per line. All lines are saved together or not at all.
export function addInterviewerNotes(db: DatabaseSync, now: Now, input: NewInterviewerNotes): InterviewerNote[] {
  requireCandidate(db, input.candidateId);
  const interviewId = input.interviewId ?? null;
  if (interviewId !== null) requireInterviewOf(db, input.candidateId, interviewId);
  const lines = noteLines(input.text);
  if (lines.length === 0) {
    throw new InvalidInputError("text", "required", "A note needs some text.");
  }
  const savedAt = now().toISOString();
  const insert = db.prepare(
    "INSERT INTO interviewer_note (id, candidate_id, interview_id, text, saved_at, position) VALUES (?, ?, ?, ?, ?, ?)",
  );
  db.exec("BEGIN");
  try {
    const rows = lines.map((text, position): NoteRow => {
      const row: NoteRow = {
        id: randomUUID(),
        candidate_id: input.candidateId,
        interview_id: interviewId,
        text,
        saved_at: savedAt,
      };
      insert.run(row.id, row.candidate_id, row.interview_id, row.text, row.saved_at, position);
      return row;
    });
    db.exec("COMMIT");
    return rows.map(toNote);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export interface NoteFilter {
  // Show only this Interview's notes and the notes tagged with no Interview. Omit for all notes.
  interviewId?: string | null;
}

// Newest save first. The lines of one save keep the order they were written in.
export function listInterviewerNotes(db: DatabaseSync, candidateId: string, filter: NoteFilter = {}): InterviewerNote[] {
  requireCandidate(db, candidateId);
  const interviewId = filter.interviewId ?? null;
  const rows = db
    .prepare(
      `SELECT ${columns} FROM interviewer_note
       WHERE candidate_id = ? AND (? IS NULL OR interview_id IS NULL OR interview_id = ?)
       ORDER BY saved_at DESC, position`,
    )
    .all(candidateId, interviewId, interviewId) as unknown as NoteRow[];
  return rows.map(toNote);
}

// Changes the text of one note. An edited note stays one note, so its lines are joined with
// spaces. The time it was saved does not change: it still says when the note was first written.
export function editInterviewerNote(db: DatabaseSync, id: string, text: string): InterviewerNote {
  const joined = noteLines(text).join(" ");
  if (joined === "") {
    throw new InvalidInputError("text", "required", "A note needs some text.");
  }
  const row = requireNote(db, id);
  db.prepare("UPDATE interviewer_note SET text = ? WHERE id = ?").run(joined, id);
  return toNote({ ...row, text: joined });
}

// Tags one note with an Interview of the same Candidate, or with none when interviewId is null.
export function tagInterviewerNote(db: DatabaseSync, id: string, interviewId: string | null): InterviewerNote {
  const row = requireNote(db, id);
  if (interviewId !== null) requireInterviewOf(db, row.candidate_id, interviewId);
  db.prepare("UPDATE interviewer_note SET interview_id = ? WHERE id = ?").run(interviewId, id);
  return toNote({ ...row, interview_id: interviewId });
}

export function deleteInterviewerNote(db: DatabaseSync, id: string): void {
  const result = db.prepare("DELETE FROM interviewer_note WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw new NotFoundError("This note does not exist.");
  }
}

function requireNote(db: DatabaseSync, id: string): NoteRow {
  const row = db.prepare(`SELECT ${columns} FROM interviewer_note WHERE id = ?`).get(id) as NoteRow | undefined;
  if (!row) {
    throw new NotFoundError("This note does not exist.");
  }
  return row;
}

function noteLines(text: string): string[] {
  return text
    .split(/\r?\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function toNote(row: NoteRow): InterviewerNote {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    interviewId: row.interview_id,
    text: row.text,
    savedAt: row.saved_at,
  };
}
