import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { listCandidates, requireCandidate, roleSpelling, type Candidate } from "./candidates.ts";
import { inTransaction } from "./database.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";
import { insertSavedQuestion, type SavedQuestion } from "./saved-questions.ts";

export interface RoleQuestion {
  id: string;
  role: string;
  text: string;
  createdAt: string;
}

export interface NewRoleQuestion {
  role: string;
  text: string;
}

// One role's questions in the Interviewer's order.
export interface RoleQuestionList {
  // The role as it is saved: the spelling it was first written with.
  role: string;
  questions: RoleQuestion[];
  // How many Candidates with this role have a question of the list that was never copied to them.
  candidatesMissingQuestions: number;
}

interface RoleQuestionRow {
  id: string;
  role: string;
  text: string;
  created_at: string;
}

const columns = "id, role, text, created_at";

// Adds a question at the end of the role's list.
export function addRoleQuestion(db: DatabaseSync, input: NewRoleQuestion): RoleQuestion {
  const row: RoleQuestionRow = {
    id: randomUUID(),
    role: roleSpelling(db, input.role),
    text: requireText(input.text),
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO role_question (${columns}, position)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM role_question WHERE role = ?))`,
  ).run(row.id, row.role, row.text, row.created_at, row.role);
  return toRoleQuestion(row);
}

export function listRoleQuestions(db: DatabaseSync, role: string): RoleQuestionList {
  const spelling = roleSpelling(db, role);
  return {
    role: spelling,
    questions: questionsOf(db, spelling),
    candidatesMissingQuestions: candidatesOf(db, spelling).filter((c) => notCopiedTo(db, c).length > 0).length,
  };
}

// Changes only the text. Copies already given to Candidates stay as they are.
export function editRoleQuestion(db: DatabaseSync, id: string, text: string): RoleQuestion {
  const question = findRoleQuestion(db, id);
  const edited = { ...question, text: requireText(text) };
  db.prepare("UPDATE role_question SET text = ? WHERE id = ?").run(edited.text, id);
  return edited;
}

// The questions of the Candidate's role that were never copied to them, in the role's order.
export function listMissingRoleQuestions(db: DatabaseSync, candidateId: string): RoleQuestion[] {
  return notCopiedTo(db, requireCandidate(db, candidateId));
}

export function addMissingRoleQuestions(db: DatabaseSync, candidateId: string): SavedQuestion[] {
  return copyRoleQuestions(db, requireCandidate(db, candidateId));
}

// Gives every Candidate with the role the questions never copied to them. Returns how many
// Candidates got at least one.
export function addRoleQuestionsToCandidates(db: DatabaseSync, role: string): number {
  const spelling = roleSpelling(db, role);
  return inTransaction(db, () => candidatesOf(db, spelling).filter((c) => copyRoleQuestions(db, c).length > 0).length);
}

function candidatesOf(db: DatabaseSync, role: string): Candidate[] {
  return listCandidates(db).filter((candidate) => candidate.role === role);
}

function findRoleQuestion(db: DatabaseSync, id: string): RoleQuestion {
  const row = db.prepare(`SELECT ${columns} FROM role_question WHERE id = ?`).get(id);
  if (!row) {
    throw new NotFoundError("This role question does not exist.");
  }
  return toRoleQuestion(row as unknown as RoleQuestionRow);
}

function questionsOf(db: DatabaseSync, role: string): RoleQuestion[] {
  const rows = db.prepare(`SELECT ${columns} FROM role_question WHERE role = ? ORDER BY position`).all(role);
  return (rows as unknown as RoleQuestionRow[]).map(toRoleQuestion);
}

// Copies every question of the Candidate's role that was never copied to them to the end of their
// Saved Questions, in the role's order, and records each copy. Returns the new Saved Questions.
export function copyRoleQuestions(db: DatabaseSync, candidate: Candidate): SavedQuestion[] {
  return inTransaction(db, () => {
    const copiedAt = new Date().toISOString();
    const record = db.prepare("INSERT INTO role_question_copy (role_question_id, candidate_id) VALUES (?, ?)");
    return notCopiedTo(db, candidate).map((question) => {
      record.run(question.id, candidate.id);
      return insertSavedQuestion(db, candidate.id, question.text, "role", copiedAt);
    });
  });
}

function notCopiedTo(db: DatabaseSync, candidate: Candidate): RoleQuestion[] {
  return questionsOf(db, candidate.role).filter(
    (question) =>
      db
        .prepare("SELECT 1 FROM role_question_copy WHERE role_question_id = ? AND candidate_id = ?")
        .get(question.id, candidate.id) === undefined,
  );
}

// Spaces and empty lines around the text are removed; line breaks inside it are kept.
function requireText(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new InvalidInputError("text", "required", "A question needs text.");
  }
  return trimmed;
}

function toRoleQuestion(row: RoleQuestionRow): RoleQuestion {
  return { id: row.id, role: row.role, text: row.text, createdAt: row.created_at };
}

// Moves a question to a new place in its role's list; position 0 is the top.
export function moveRoleQuestion(db: DatabaseSync, id: string, position: number): void {
  const question = findRoleQuestion(db, id);
  const order = questionsOf(db, question.role).map((q) => q.id);
  if (!Number.isInteger(position) || position < 0 || position >= order.length) {
    throw new InvalidInputError("position", "format", "A question can only move to a place inside its list.");
  }
  order.splice(order.indexOf(id), 1);
  order.splice(position, 0, id);
  const update = db.prepare("UPDATE role_question SET position = ? WHERE id = ?");
  inTransaction(db, () => order.forEach((questionId, index) => update.run(index, questionId)));
}

// Deletes the question from its role's list. Copies already given to Candidates stay.
export function deleteRoleQuestion(db: DatabaseSync, id: string): void {
  findRoleQuestion(db, id);
  db.prepare("DELETE FROM role_question WHERE id = ?").run(id);
}
