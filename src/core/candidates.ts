import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { InvalidInputError } from "./errors.ts";

export interface Candidate {
  id: string;
  name: string;
  role: string;
  createdAt: string;
}

export interface NewCandidate {
  name: string;
  role: string;
}

interface CandidateRow {
  id: string;
  name: string;
  role: string;
  created_at: string;
}

export function createCandidate(db: DatabaseSync, input: NewCandidate): Candidate {
  const candidate: Candidate = {
    id: randomUUID(),
    name: requireText("name", input.name),
    role: existingSpelling(db, collapseSpaces(requireText("role", input.role))),
    createdAt: new Date().toISOString(),
  };
  db.prepare("INSERT INTO candidate (id, name, role, created_at) VALUES (?, ?, ?, ?)").run(
    candidate.id,
    candidate.name,
    candidate.role,
    candidate.createdAt,
  );
  return candidate;
}

export function listCandidates(db: DatabaseSync): Candidate[] {
  const rows = db.prepare("SELECT id, name, role, created_at FROM candidate ORDER BY created_at DESC, rowid DESC").all();
  return (rows as unknown as CandidateRow[]).map(toCandidate);
}

export function getCandidate(db: DatabaseSync, id: string): Candidate | undefined {
  const row = db.prepare("SELECT id, name, role, created_at FROM candidate WHERE id = ?").get(id);
  return row ? toCandidate(row as unknown as CandidateRow) : undefined;
}

// Every Candidate role used so far, once each, in alphabetical order. Suggested when a Candidate is added.
export function listCandidateRoles(db: DatabaseSync): string[] {
  const alphabetical = new Intl.Collator("en", { sensitivity: "accent" });
  return rolesInOrderWritten(db).sort(alphabetical.compare);
}

function rolesInOrderWritten(db: DatabaseSync): string[] {
  const rows = db
    .prepare("SELECT role FROM candidate GROUP BY role ORDER BY MIN(rowid)")
    .all() as unknown as { role: string }[];
  return rows.map((row) => row.role);
}

// Returns the role as it was first written, if an equal one exists; otherwise the role itself.
function existingSpelling(db: DatabaseSync, role: string): string {
  return rolesInOrderWritten(db).find((existing) => isSameRole(existing, role)) ?? role;
}

// Two roles are the same if they differ only in letter case. Capital I is i in English but
// ı in Turkish, and one role can mix both languages ("SENIOR YAZILIM MÜHENDİSİ"), so the
// comparison goes letter by letter and lets I stand for either. The machine's default
// language is never used, so the result is the same on every computer.
function isSameRole(a: string, b: string): boolean {
  const left = [...a.normalize("NFC")];
  const right = [...b.normalize("NFC")];
  return left.length === right.length && left.every((letter, i) => sameLetter(letter, right[i]!));
}

function sameLetter(a: string, b: string): boolean {
  const options = lowerCaseOptions(b);
  return lowerCaseOptions(a).some((lower) => options.includes(lower));
}

function lowerCaseOptions(letter: string): string[] {
  if (letter === "I") return ["i", "ı"];
  if (letter === "İ") return ["i"];
  return [letter.toLocaleLowerCase("en")];
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ");
}

function requireText(field: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new InvalidInputError(field, "required", `A Candidate needs a ${field}.`);
  }
  return trimmed;
}

function toCandidate(row: CandidateRow): Candidate {
  return { id: row.id, name: row.name, role: row.role, createdAt: row.created_at };
}
