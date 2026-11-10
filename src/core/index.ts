// The public interface of core. web and mcp import only from this file.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as candidates from "./candidates.ts";
import { openDatabase } from "./database.ts";
import * as interviews from "./interviews.ts";

export type { Candidate, NewCandidate } from "./candidates.ts";
export { InvalidInputError } from "./errors.ts";
export type { Interview, NewInterview } from "./interviews.ts";

export interface Core {
  createCandidate(input: candidates.NewCandidate): candidates.Candidate;
  listCandidates(): candidates.Candidate[];
  getCandidate(id: string): candidates.Candidate | undefined;
  listCandidateRoles(): string[];
  addInterview(input: interviews.NewInterview): interviews.Interview;
  listInterviews(candidateId: string): interviews.Interview[];
  listInterviewStages(): string[];
  close(): void;
}

// Opens (and creates, if needed) the database file at dbPath and brings its schema up to date.
export function openCore(dbPath: string): Core {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDatabase(dbPath);
  return {
    createCandidate: (input) => candidates.createCandidate(db, input),
    listCandidates: () => candidates.listCandidates(db),
    getCandidate: (id) => candidates.getCandidate(db, id),
    listCandidateRoles: () => candidates.listCandidateRoles(db),
    addInterview: (input) => interviews.addInterview(db, input),
    listInterviews: (candidateId) => interviews.listInterviews(db, candidateId),
    listInterviewStages: () => interviews.listInterviewStages(db),
    close: () => db.close(),
  };
}

// The database the app uses: data/interview-companion.sqlite in the project folder,
// or inside DATA_DIR when it is set. It does not depend on the current directory,
// because an MCP client may start the server from anywhere.
export function defaultDatabasePath(): string {
  const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
  const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(projectRoot, "data");
  return resolve(dataDir, "interview-companion.sqlite");
}
