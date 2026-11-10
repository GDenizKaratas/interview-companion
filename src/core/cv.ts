import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createCandidate, requireCandidate, type Candidate, type NewCandidate } from "./candidates.ts";
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

// Where the CV files live: a folder next to the database file.
export type CvFolder = string;

export interface NewCandidateWithCv extends NewCandidate {
  cv: CvFile;
}

export async function attachCv(
  db: DatabaseSync,
  folder: CvFolder,
  now: Now,
  candidateId: string,
  file: CvFile,
): Promise<Cv> {
  requireCandidate(db, candidateId);
  const pages = await readCvText(file);
  saveCv(db, folder, now, file, pages, () => candidateId);
  return getCv(db, candidateId)!;
}

// Creates the Candidate and attaches the CV together: if either is refused, neither is saved.
export async function createCandidateWithCv(
  db: DatabaseSync,
  folder: CvFolder,
  now: Now,
  input: NewCandidateWithCv,
): Promise<Candidate> {
  const pages = await readCvText(input.cv);
  let candidate: Candidate | undefined;
  saveCv(db, folder, now, input.cv, pages, () => {
    candidate = createCandidate(db, input);
    return candidate.id;
  });
  return candidate!;
}

// Reads the text of each page, or refuses a file that is not a readable PDF or has no text.
async function readCvText(file: CvFile): Promise<PdfTextPage[]> {
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
  return pages;
}

// Stores the file and its text for the Candidate that owner() names, replacing any earlier CV.
// owner() runs inside the same transaction, so a Candidate it creates is saved only with the CV.
// The new file is written first under a new name; the database then switches to it in one
// transaction, and only after that is the old file removed. If anything fails, nothing changes.
function saveCv(
  db: DatabaseSync,
  folder: CvFolder,
  now: Now,
  file: CvFile,
  pages: PdfTextPage[],
  owner: () => string,
): void {
  // The file gets a name made by core, so a name chosen by the Interviewer never becomes a path.
  const storedName = `${randomUUID()}.pdf`;
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, storedName), file.bytes);
  let previous: CvRow | undefined;
  try {
    db.exec("BEGIN");
    try {
      const candidateId = owner();
      previous = findRow(db, candidateId);
      db.prepare("DELETE FROM cv WHERE candidate_id = ?").run(candidateId);
      db.prepare("INSERT INTO cv (candidate_id, file_name, stored_name, uploaded_at) VALUES (?, ?, ?, ?)").run(
        candidateId,
        file.fileName,
        storedName,
        now().toISOString(),
      );
      const insertPage = db.prepare("INSERT INTO cv_page (candidate_id, number, text) VALUES (?, ?, ?)");
      for (const [i, page] of pages.entries()) {
        insertPage.run(candidateId, i + 1, page.text);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    rmSync(join(folder, storedName), { force: true });
    throw error;
  }
  if (previous) rmSync(join(folder, previous.stored_name), { force: true });
}

export function getCv(db: DatabaseSync, candidateId: string): Cv | undefined {
  const row = findRow(db, candidateId);
  if (!row) return undefined;
  const pages = db
    .prepare("SELECT number, text FROM cv_page WHERE candidate_id = ? ORDER BY number")
    .all(candidateId) as unknown as CvPage[];
  return {
    candidateId: row.candidate_id,
    fileName: row.file_name,
    uploadedAt: row.uploaded_at,
    pages: pages.map(({ number, text }) => ({ number, text })),
  };
}

export function readCvFile(db: DatabaseSync, folder: CvFolder, candidateId: string): CvFile | undefined {
  const row = findRow(db, candidateId);
  if (!row) return undefined;
  return { fileName: row.file_name, bytes: new Uint8Array(readFileSync(join(folder, row.stored_name))) };
}

function findRow(db: DatabaseSync, candidateId: string): CvRow | undefined {
  return db
    .prepare("SELECT candidate_id, file_name, stored_name, uploaded_at FROM cv WHERE candidate_id = ?")
    .get(candidateId) as unknown as CvRow | undefined;
}
