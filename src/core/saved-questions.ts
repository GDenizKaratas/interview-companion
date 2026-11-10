import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getCandidate } from "./candidates.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";

// Where a Saved Question came from: written by the Interviewer, or copied from a Suggested Question.
export type QuestionOrigin = "written" | "suggestion";

export interface SavedQuestion {
  id: string;
  candidateId: string;
  text: string;
  origin: QuestionOrigin;
  createdAt: string;
}

export interface NewSavedQuestion {
  candidateId: string;
  text: string;
}

interface SavedQuestionRow {
  id: string;
  candidate_id: string;
  text: string;
  origin: QuestionOrigin;
  created_at: string;
}

const columns = "id, candidate_id, text, origin, created_at";

// Adds a hand-written question at the end of the Candidate's list.
export function addSavedQuestion(db: DatabaseSync, input: NewSavedQuestion): SavedQuestion {
  if (!getCandidate(db, input.candidateId)) {
    throw new NotFoundError("This Candidate does not exist.");
  }
  const row: SavedQuestionRow = {
    id: randomUUID(),
    candidate_id: input.candidateId,
    text: requireText(input.text),
    origin: "written",
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO saved_question (${columns}, position)
     VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM saved_question WHERE candidate_id = ?))`,
  ).run(row.id, row.candidate_id, row.text, row.origin, row.created_at, row.candidate_id);
  return toSavedQuestion(row);
}

// A Candidate's questions in the Interviewer's order.
export function listSavedQuestions(db: DatabaseSync, candidateId: string): SavedQuestion[] {
  const rows = db.prepare(`SELECT ${columns} FROM saved_question WHERE candidate_id = ? ORDER BY position`).all(candidateId);
  return (rows as unknown as SavedQuestionRow[]).map(toSavedQuestion);
}

// Changes only the text; the place in the list and the origin stay.
export function editSavedQuestion(db: DatabaseSync, id: string, text: string): SavedQuestion {
  const question = findSavedQuestion(db, id);
  const edited = { ...question, text: requireText(text) };
  db.prepare("UPDATE saved_question SET text = ? WHERE id = ?").run(edited.text, id);
  return edited;
}

export function deleteSavedQuestion(db: DatabaseSync, id: string): void {
  findSavedQuestion(db, id);
  db.prepare("DELETE FROM saved_question WHERE id = ?").run(id);
}

// Moves a question to a new place in its Candidate's list. Position 0 is the top,
// and the last position is the number of questions minus one.
export function moveSavedQuestion(db: DatabaseSync, id: string, position: number): void {
  const question = findSavedQuestion(db, id);
  const order = listSavedQuestions(db, question.candidateId).map((q) => q.id);
  if (!Number.isInteger(position) || position < 0 || position >= order.length) {
    throw new InvalidInputError("position", "format", "A question can only move to a place inside its list.");
  }
  order.splice(order.indexOf(id), 1);
  order.splice(position, 0, id);
  const update = db.prepare("UPDATE saved_question SET position = ? WHERE id = ?");
  db.exec("BEGIN");
  try {
    order.forEach((questionId, index) => update.run(index, questionId));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
  return { id: row.id, candidateId: row.candidate_id, text: row.text, origin: row.origin, createdAt: row.created_at };
}
