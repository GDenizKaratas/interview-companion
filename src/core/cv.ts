import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createCandidate, deleteCandidate, requireCandidate, type Candidate, type NewCandidate } from "./candidates.ts";
import { inTransaction } from "./database.ts";
import type { Now } from "./interviewer-notes.ts";
import { InvalidInputError } from "./errors.ts";
import { readPdfText, UnreadablePdfError, type PdfTextPage } from "./pdf-text.ts";

export interface CvPage {
  number: number;
  text: string;
}

export interface Cv {
  candidateId: string;
  // The name of the file the Interviewer chose. Only shown; never used as a path.
  fileName: string;
  uploadedAt: string;
  pages: CvPage[];
}

export interface CvFile {
  fileName: string;
  bytes: Uint8Array;
}

interface CvRow {
  candidate_id: string;
  file_name: string;
  stored_name: string;
  uploaded_at: string;
}

export interface NewCandidateWithCv extends NewCandidate {
  cv: CvFile;
}

// A CV file whose text has been read and accepted, ready to be stored.
export interface AcceptedCv {
  file: CvFile;
  pages: PdfTextPage[];
}

// folder is where the CV files live: a folder next to the database file.
export async function attachCv(
  db: DatabaseSync,
  folder: string,
  now: Now,
  candidateId: string,
  file: CvFile,
): Promise<Cv> {
  requireCandidate(db, candidateId);
  const cv = await acceptCv(file);
  // The Candidate is checked again: it may have been deleted while the PDF was read.
  storeCv(db, folder, now, cv, () => {
    requireCandidate(db, candidateId);
    return { id: candidateId };
  });
  return getCv(db, candidateId)!;
}

// Creates the Candidate and attaches the CV together: if either is refused, neither is saved.
export async function createCandidateWithCv(
  db: DatabaseSync,
  folder: string,
  now: Now,
  input: NewCandidateWithCv,
): Promise<Candidate> {
  const cv = await acceptCv(input.cv);
  return storeCv(db, folder, now, cv, () => createCandidate(db, input));
}

// Reads the text of each page, or refuses a file that is missing, is not a readable PDF, or has no text.
export async function acceptCv(file: CvFile): Promise<AcceptedCv> {
  if (file.bytes.length === 0) {
    throw new InvalidInputError("cv", "required", "Choose a CV file.");
  }
  let pages: PdfTextPage[];
  try {
    pages = await readPdfText(file.bytes);
  } catch (error) {
    if (error instanceof UnreadablePdfError) {
      throw new InvalidInputError("cv", "format", "This file is not a PDF that can be opened.");
    }
    throw error;
  }
  if (pages.every((page) => page.text === "")) {
    throw new InvalidInputError("cv", "readableText", "This PDF has no readable text.");
  }
  return { file, pages };
}

// Runs change(), which names the Candidate (and may create it), and stores the CV for that
// Candidate, replacing any earlier CV, all in one transaction. The new file is written first
// under a new name; only after the database has switched to it are the replaced files removed
// (the Candidate's earlier CV, and any listed in replacedFiles). If anything fails, the new
// file is removed and nothing else changes. afterStored, if given, runs in the same transaction
// once the CV is stored, for changes that need it, such as checking quotes from it.
export function storeCv<T extends { id: string }>(
  db: DatabaseSync,
  folder: string,
  now: Now,
  cv: AcceptedCv,
  change: () => T,
  replacedFiles: string[] = [],
  afterStored?: (owner: T) => void,
): T {
  // The file gets a name made by core, so a name chosen by the Interviewer never becomes a path.
  const storedName = `${randomUUID()}.pdf`;
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, storedName), cv.file.bytes);
  let result: { owner: T; previous: string | undefined };
  try {
    result = inTransaction(db, () => {
      const owner = change();
      const previous = storedFileName(db, owner.id);
      db.prepare("DELETE FROM cv WHERE candidate_id = ?").run(owner.id);
      db.prepare("INSERT INTO cv (candidate_id, file_name, stored_name, uploaded_at) VALUES (?, ?, ?, ?)").run(
        owner.id,
        cv.file.fileName,
        storedName,
        now().toISOString(),
      );
      const insertPage = db.prepare("INSERT INTO cv_page (candidate_id, number, text) VALUES (?, ?, ?)");
      for (const [i, page] of cv.pages.entries()) {
        insertPage.run(owner.id, i + 1, page.text);
      }
      afterStored?.(owner);
      return { owner, previous };
    });
  } catch (error) {
    removeCvFile(folder, storedName);
    throw error;
  }
  for (const name of [result.previous, ...replacedFiles]) {
    if (name !== undefined) removeCvFile(folder, name);
  }
  return result.owner;
}

// Deletes the Candidate with everything about them, including the CV file (decision 28).
export function deleteCandidateAndCv(db: DatabaseSync, folder: string, candidateId: string): void {
  const file = storedFileName(db, candidateId);
  deleteCandidate(db, candidateId);
  if (file !== undefined) removeCvFile(folder, file);
}

// The name the Candidate's CV file is stored under, if they have a CV.
export function storedFileName(db: DatabaseSync, candidateId: string): string | undefined {
  return findRow(db, candidateId)?.stored_name;
}

function removeCvFile(folder: string, storedName: string): void {
  rmSync(join(folder, storedName), { force: true });
}

export function getCv(db: DatabaseSync, candidateId: string): Cv | undefined {
  const row = findRow(db, candidateId);
  if (!row) return undefined;
  const pages = db
    .prepare("SELECT number, text FROM cv_page WHERE candidate_id = ? ORDER BY number")
    .all(candidateId) as unknown as CvPage[];
  return { candidateId: row.candidate_id, fileName: row.file_name, uploadedAt: row.uploaded_at, pages };
}

export function readCvFile(db: DatabaseSync, folder: string, candidateId: string): CvFile | undefined {
  const row = findRow(db, candidateId);
  if (!row) return undefined;
  return { fileName: row.file_name, bytes: new Uint8Array(readFileSync(join(folder, row.stored_name))) };
}

function findRow(db: DatabaseSync, candidateId: string): CvRow | undefined {
  return db
    .prepare("SELECT candidate_id, file_name, stored_name, uploaded_at FROM cv WHERE candidate_id = ?")
    .get(candidateId) as unknown as CvRow | undefined;
}
