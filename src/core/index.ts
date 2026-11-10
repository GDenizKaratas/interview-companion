// The public interface of core. web and mcp import only from this file.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as candidates from "./candidates.ts";
import { openDatabase } from "./database.ts";
import * as interfaceLanguage from "./interface-language.ts";
import * as savedQuestions from "./saved-questions.ts";

export type { Candidate, NewCandidate } from "./candidates.ts";
export { InvalidInputError, NotFoundError, type InputRule } from "./errors.ts";
export type { NewSavedQuestion, QuestionOrigin, SavedQuestion } from "./saved-questions.ts";

export interface Core {
  createCandidate(input: candidates.NewCandidate): candidates.Candidate;
  listCandidates(): candidates.Candidate[];
  getCandidate(id: string): candidates.Candidate | undefined;
  listCandidateRoles(): string[];
  getInterfaceLanguage(): string;
  setInterfaceLanguage(language: string): void;
  addSavedQuestion(input: savedQuestions.NewSavedQuestion): savedQuestions.SavedQuestion;
  listSavedQuestions(candidateId: string): savedQuestions.SavedQuestion[];
  editSavedQuestion(id: string, text: string): savedQuestions.SavedQuestion;
  deleteSavedQuestion(id: string): void;
  moveSavedQuestion(id: string, position: number): void;
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
    getInterfaceLanguage: () => interfaceLanguage.getInterfaceLanguage(db),
    setInterfaceLanguage: (language) => interfaceLanguage.setInterfaceLanguage(db, language),
    addSavedQuestion: (input) => savedQuestions.addSavedQuestion(db, input),
    listSavedQuestions: (candidateId) => savedQuestions.listSavedQuestions(db, candidateId),
    editSavedQuestion: (id, text) => savedQuestions.editSavedQuestion(db, id, text),
    deleteSavedQuestion: (id) => savedQuestions.deleteSavedQuestion(db, id),
    moveSavedQuestion: (id, position) => savedQuestions.moveSavedQuestion(db, id, position),
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
