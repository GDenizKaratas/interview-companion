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

export function listRoles(db: DatabaseSync): string[] {
  const rows = db.prepare("SELECT DISTINCT role FROM candidate").all() as unknown as { role: string }[];
  const alphabetical = new Intl.Collator("tr");
  return rows.map((row) => row.role).sort(alphabetical.compare);
}

// Letter case does not make a different role. Capital I is lower-case i in English but ı in
// Turkish, so two roles are the same if they are equal under either language's rules.
// The machine's default language is never used, so the result is the same on every computer.
const caseInsensitive = [
  new Intl.Collator("en", { sensitivity: "accent" }),
  new Intl.Collator("tr", { sensitivity: "accent" }),
];

function isSameRole(a: string, b: string): boolean {
  return caseInsensitive.some((collator) => collator.compare(a, b) === 0);
}

// Returns the role as it was first written, if an equal one exists; otherwise the role itself.
function existingSpelling(db: DatabaseSync, role: string): string {
  return listRoles(db).find((existing) => isSameRole(existing, role)) ?? role;
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ");
}

function requireText(field: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new InvalidInputError(field, `A Candidate needs a ${field}.`);
  }
  return trimmed;
}

function toCandidate(row: CandidateRow): Candidate {
  return { id: row.id, name: row.name, role: row.role, createdAt: row.created_at };
}
