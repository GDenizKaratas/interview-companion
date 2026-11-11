import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { requireCandidate } from "./candidates.ts";
import { inTransaction } from "./database.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";
import { interviewFilterCondition, requireInterviewOf, type InterviewFilter } from "./interviews.ts";

// Where a Saved Question came from: written by the Interviewer, copied from a Suggested Question,
// or copied from a Role Question.
export type QuestionOrigin = "written" | "suggestion" | "role";

export interface SavedQuestion {
  id: string;
  candidateId: string;
  // The Interview the question is tagged with, or null when it belongs to no Interview.
  interviewId: string | null;
  text: string;
  origin: QuestionOrigin;
  createdAt: string;
}

export interface NewSavedQuestion {
  candidateId: string;
  interviewId?: string | null;
  text: string;
}

interface SavedQuestionRow {
  id: string;
  candidate_id: string;
  interview_id: string | null;
  text: string;
  // The stored origin is written or suggestion; from_role marks a copy of a Role Question, whose
  // stored origin is written.
  origin: Exclude<QuestionOrigin, "role">;
  from_role: 0 | 1;
  created_at: string;
}

const columns = "id, candidate_id, interview_id, text, origin, from_role, created_at";

// Adds a hand-written question at the end of the Candidate's list.
export function addSavedQuestion(db: DatabaseSync, input: NewSavedQuestion): SavedQuestion {
  requireCandidate(db, input.candidateId);
  const interviewId = input.interviewId ?? null;
  if (interviewId !== null) requireInterviewOf(db, input.candidateId, interviewId);
  return insertSavedQuestion(db, input.candidateId, input.text, "written", new Date().toISOString(), interviewId);
}

// Adds a question at the end of the Candidate's list. Core uses it to copy an accepted
// Suggested Question or a Role Question; the copy does not point back to where it came from.
export function insertSavedQuestion(
  db: DatabaseSync,
  candidateId: string,
  text: string,
  origin: QuestionOrigin,
  createdAt: string,
  interviewId: string | null = null,
): SavedQuestion {
  const row: SavedQuestionRow = {
    id: randomUUID(),
    candidate_id: candidateId,
    interview_id: interviewId,
    text: requireText(text),
    origin: origin === "role" ? "written" : origin,
    from_role: origin === "role" ? 1 : 0,
    created_at: createdAt,
  };
  db.prepare(
    `INSERT INTO saved_question (${columns}, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM saved_question WHERE candidate_id = ?))`,
  ).run(row.id, row.candidate_id, row.interview_id, row.text, row.origin, row.from_role, row.created_at, row.candidate_id);
  return toSavedQuestion(row);
}

// A Candidate's questions in the Interviewer's order, through the same Interview filter as
// Interviewer Notes.
export function listSavedQuestions(db: DatabaseSync, candidateId: string, filter: InterviewFilter = {}): SavedQuestion[] {
  requireCandidate(db, candidateId);
  const condition = interviewFilterCondition(db, candidateId, filter);
  const rows = db
    .prepare(`SELECT ${columns} FROM saved_question WHERE candidate_id = ? AND ${condition.sql} ORDER BY position`)
    .all(candidateId, ...condition.params);
  return (rows as unknown as SavedQuestionRow[]).map(toSavedQuestion);
}

// Changes only the text; the place in the list and the origin stay.
export function editSavedQuestion(db: DatabaseSync, id: string, text: string): SavedQuestion {
  const question = findSavedQuestion(db, id);
  const edited = { ...question, text: requireText(text) };
  db.prepare("UPDATE saved_question SET text = ? WHERE id = ?").run(edited.text, id);
  return edited;
}

// Tags one question with an Interview of the same Candidate, or with none when interviewId is null.
// The text, the place in the list, and the origin stay.
export function tagSavedQuestion(db: DatabaseSync, id: string, interviewId: string | null): SavedQuestion {
  const question = findSavedQuestion(db, id);
  if (interviewId !== null) requireInterviewOf(db, question.candidateId, interviewId);
  db.prepare("UPDATE saved_question SET interview_id = ? WHERE id = ?").run(interviewId, id);
  return { ...question, interviewId };
}

export function deleteSavedQuestion(db: DatabaseSync, id: string): void {
  findSavedQuestion(db, id);
  db.prepare("DELETE FROM saved_question WHERE id = ?").run(id);
}

// Moves a question to a new place in its Candidate's list as it is shown through the Interview
// filter. Position 0 is the top of the shown list, and the last position is the number of shown
// questions minus one. The question lands right before the shown question that follows it, or
// right after the one before it at the end; questions the filter hides keep their places.
export function moveSavedQuestion(db: DatabaseSync, id: string, position: number, filter: InterviewFilter = {}): void {
  const question = findSavedQuestion(db, id);
  const shown = listSavedQuestions(db, question.candidateId, filter).map((q) => q.id);
  if (!shown.includes(id)) {
    throw new InvalidInputError("position", "format", "A question hidden by the Interview filter cannot be moved.");
  }
  if (!Number.isInteger(position) || position < 0 || position >= shown.length) {
    throw new InvalidInputError("position", "format", "A question can only move to a place inside its list.");
  }
  if (shown.indexOf(id) === position) return;
  shown.splice(shown.indexOf(id), 1);
  shown.splice(position, 0, id);
  const order = listSavedQuestions(db, question.candidateId).map((q) => q.id);
  order.splice(order.indexOf(id), 1);
  const next = shown[position + 1];
  const at = next !== undefined ? order.indexOf(next) : order.indexOf(shown[position - 1]!) + 1;
  order.splice(at, 0, id);
  const update = db.prepare("UPDATE saved_question SET position = ? WHERE id = ?");
  inTransaction(db, () => order.forEach((questionId, index) => update.run(index, questionId)));
}

function findSavedQuestion(db: DatabaseSync, id: string): SavedQuestion {
  const row = db.prepare(`SELECT ${columns} FROM saved_question WHERE id = ?`).get(id);
  if (!row) {
    throw new NotFoundError("This question does not exist.");
  }
  return toSavedQuestion(row as unknown as SavedQuestionRow);
}

// Spaces and empty lines around the text are removed; line breaks inside it are kept.
function requireText(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new InvalidInputError("text", "required", "A question needs text.");
  }
  return trimmed;
}

function toSavedQuestion(row: SavedQuestionRow): SavedQuestion {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    interviewId: row.interview_id,
    text: row.text,
    origin: row.from_role === 1 ? "role" : row.origin,
    createdAt: row.created_at,
  };
}
