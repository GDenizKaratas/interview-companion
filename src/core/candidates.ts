import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "./database.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";
import { copyRoleQuestions } from "./role-questions.ts";
import { sameLetter } from "./turkish-letters.ts";

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
  return insertCandidate(db, randomUUID(), input);
}

// Creates a Candidate under a given id, with a copy of each Role Question of their role among their
// Saved Questions. Only the demo Candidates need a fixed id.
export function insertCandidate(db: DatabaseSync, id: string, input: NewCandidate): Candidate {
  return inTransaction(db, () => {
    const candidate = insertCandidateRow(db, id, input);
    copyRoleQuestions(db, candidate);
    return candidate;
  });
}

// Adds the Candidate alone, with no Role Questions. An imported Candidate brings their own questions.
export function insertCandidateRow(db: DatabaseSync, id: string, input: NewCandidate): Candidate {
  const candidate: Candidate = {
    id,
    name: requireText("name", input.name),
    role: roleSpelling(db, input.role),
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

// Deletes the Candidate and everything about them. The database removes their Interviews,
// Interviewer Notes, and Saved Questions with them (ON DELETE CASCADE).
export function deleteCandidate(db: DatabaseSync, id: string): void {
  if (!deleteCandidateIfExists(db, id)) {
    throw new NotFoundError("This Candidate does not exist.");
  }
}

// Like deleteCandidate, but a missing Candidate is not an error. Returns whether one was deleted.
export function deleteCandidateIfExists(db: DatabaseSync, id: string): boolean {
  return db.prepare("DELETE FROM candidate WHERE id = ?").run(id).changes > 0;
}

export function hasAnyCandidate(db: DatabaseSync): boolean {
  return db.prepare("SELECT 1 FROM candidate LIMIT 1").get() !== undefined;
}

// Returns the Candidate, or refuses with NotFoundError when they do not exist.
export function requireCandidate(db: DatabaseSync, id: string): Candidate {
  const candidate = getCandidate(db, id);
  if (!candidate) {
    throw new NotFoundError("This Candidate does not exist.");
  }
  return candidate;
}

// Every role used so far by a Candidate or a Role Question, once each, in alphabetical order.
// Suggested when a Candidate is added and when Role Questions are chosen.
export function listCandidateRoles(db: DatabaseSync): string[] {
  const alphabetical = new Intl.Collator("en", { sensitivity: "accent" });
  return rolesInOrderWritten(db).sort(alphabetical.compare);
}

// A role that at least one Candidate has, with those Candidates, oldest first.
export interface RoleInUse {
  // The role as every Candidate who has it carries it.
  role: string;
  candidateIds: string[];
}

// Every role that a Candidate has, once each, in Turkish alphabetical order, as the interface is
// used mostly in Turkish. Roles are saved under one spelling (roleSpelling), so equal text is one
// role. Roles that only Role Questions use are left out: no Candidate can be filtered by them.
export function listRolesInUse(db: DatabaseSync): RoleInUse[] {
  const rows = db.prepare("SELECT id, role FROM candidate ORDER BY rowid").all() as unknown as { id: string; role: string }[];
  const roles = new Map<string, string[]>();
  for (const row of rows) roles.set(row.role, [...(roles.get(row.role) ?? []), row.id]);
  const alphabetical = new Intl.Collator("tr", { sensitivity: "accent" });
  return [...roles]
    .map(([role, candidateIds]) => ({ role, candidateIds }))
    .sort((a, b) => alphabetical.compare(a.role, b.role));
}

// The spelling under which Candidates have this role, by the rule that saves roles: spaces trimmed
// and collapsed, letter case ignored. Undefined when no Candidate has it, or for an empty role.
export function findRoleInUse(db: DatabaseSync, role: string): string | undefined {
  const cleaned = collapseSpaces(role.trim());
  if (cleaned === "") return undefined;
  return listRolesInUse(db).find((existing) => isSameRole(existing.role, cleaned))?.role;
}

// Candidate roles first, then roles that only Role Questions use, each in the order first written.
function rolesInOrderWritten(db: DatabaseSync): string[] {
  const rows = db
    .prepare(
      `SELECT role FROM (
         SELECT role, 0 AS source, MIN(rowid) AS first FROM candidate GROUP BY role
         UNION ALL
         SELECT role, 1 AS source, MIN(rowid) AS first FROM role_question
         WHERE role NOT IN (SELECT role FROM candidate) GROUP BY role
       ) ORDER BY source, first`,
    )
    .all() as unknown as { role: string }[];
  return rows.map((row) => row.role);
}

// The role as it is saved: spaces trimmed and collapsed, then the spelling it was first written
// with, by a Candidate or a Role Question, if an equal one exists. Refuses an empty role.
export function roleSpelling(db: DatabaseSync, role: string): string {
  const cleaned = collapseSpaces(requireText("role", role));
  return rolesInOrderWritten(db).find((existing) => isSameRole(existing, cleaned)) ?? cleaned;
}

// Two roles are the same if they differ only in letter case. One role can mix Turkish and
// English ("SENIOR YAZILIM MÜHENDİSİ"), so the comparison goes letter by letter.
export function isSameRole(a: string, b: string): boolean {
  const left = [...a.normalize("NFC")];
  const right = [...b.normalize("NFC")];
  return left.length === right.length && left.every((letter, i) => sameLetter(letter, right[i]!));
}

// Whether a Candidate with this name and role is already in the app. Names are compared as roles
// are: spaces trimmed and collapsed, and letter case ignored. An empty name or role matches no one.
export function isCandidateAdded(db: DatabaseSync, name: string, role: string): boolean {
  const cleanName = collapseSpaces(name.trim());
  const cleanRole = collapseSpaces(role.trim());
  if (cleanName === "" || cleanRole === "") return false;
  const rows = db.prepare("SELECT name, role FROM candidate").all() as unknown as { name: string; role: string }[];
  return rows.some((row) => isSameRole(row.role, cleanRole) && isSameName(collapseSpaces(row.name), cleanName));
}

// Two Candidate names are the same by the rule for roles: only letter case may differ, letter by
// letter, so "IŞIL DEMİR" read from a CV is the "Işıl Demir" already added.
function isSameName(a: string, b: string): boolean {
  return isSameRole(a, b);
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
