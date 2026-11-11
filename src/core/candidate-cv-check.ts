import type { DatabaseSync } from "node:sqlite";
import { isCandidateAdded } from "./candidates.ts";
import { acceptCv, type CvFile } from "./cv.ts";
import { InvalidInputError, type InputRule } from "./errors.ts";
import { guessNameFromLines } from "./name-guess.ts";

export interface CandidateCvToCheck {
  role: string;
  cv: CvFile;
  // The name as the Interviewer corrected it. When left out, the name is read from the CV.
  name?: string;
}

// What the Interviewer needs to know about one CV before a Candidate is added from it.
export interface CandidateCvCheck {
  // The name the Candidate would get: the one given, or else the one read from the CV. It is
  // empty when none could be read.
  name: string;
  // The rule the file breaks as a CV, or null when it can be added.
  refusal: InputRule | null;
  // Whether a Candidate with this name and role is already in the app.
  alreadyAdded: boolean;
}

// Checks one CV for adding a Candidate from it, and saves nothing. The file is refused for the
// same reasons as when a CV is added.
export async function checkCandidateCv(db: DatabaseSync, input: CandidateCvToCheck): Promise<CandidateCvCheck> {
  const { firstPageLines, refusal } = await readCv(input.cv);
  const name = (input.name ?? guessNameFromLines(firstPageLines, input.cv.fileName)).trim();
  return { name, refusal, alreadyAdded: refusal === null && isCandidateAdded(db, name, input.role) };
}

async function readCv(file: CvFile) {
  try {
    const cv = await acceptCv(file);
    return { firstPageLines: cv.pages[0]?.lines ?? [], refusal: null };
  } catch (error) {
    if (error instanceof InvalidInputError && error.field === "cv") return { firstPageLines: [], refusal: error.rule };
    throw error;
  }
}
