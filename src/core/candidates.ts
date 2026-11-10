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
    role: requireText("role", input.role),
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
