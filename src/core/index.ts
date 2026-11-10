// The public interface of core. web and mcp import only from this file.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as candidates from "./candidates.ts";
import { openDatabase } from "./database.ts";
import * as interfaceLanguage from "./interface-language.ts";
import * as interviews from "./interviews.ts";
import * as savedQuestions from "./saved-questions.ts";

export type { Candidate, NewCandidate } from "./candidates.ts";
export { InvalidInputError, NotFoundError, type InputRule } from "./errors.ts";
export type { Interview, NewInterview } from "./interviews.ts";
export type { NewSavedQuestion, QuestionOrigin, SavedQuestion } from "./saved-questions.ts";

export interface Core {
  createCandidate(input: candidates.NewCandidate): candidates.Candidate;
  listCandidates(): candidates.Candidate[];
  getCandidate(id: string): candidates.Candidate | undefined;
  listCandidateRoles(): string[];
  addInterview(input: interviews.NewInterview): interviews.Interview;
  listInterviews(candidateId: string): interviews.Interview[];
  getInterfaceLanguage(): string;
  setInterfaceLanguage(language: string): void;
  addSavedQuestion(input: savedQuestions.NewSavedQuestion): savedQuestions.SavedQuestion;
  listSavedQuestions(candidateId: string): savedQuestions.SavedQuestion[];
  editSavedQuestion(id: string, text: string): savedQuestions.SavedQuestion;
  deleteSavedQuestion(id: string): void;
  moveSavedQuestion(id: string, position: number): void;
  close(): void;
}

export interface CoreOptions {
  // Today as YYYY-MM-DD. Defaults to the day on this computer's clock; tests fix it.
  today?: interviews.Today;
}

// Opens (and creates, if needed) the database file at dbPath and brings its schema up to date.
export function openCore(dbPath: string, options: CoreOptions = {}): Core {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDatabase(dbPath);
  const today = options.today ?? localToday;
  return {
    createCandidate: (input) => candidates.createCandidate(db, input),
    listCandidates: () => candidates.listCandidates(db),
    getCandidate: (id) => candidates.getCandidate(db, id),
    listCandidateRoles: () => candidates.listCandidateRoles(db),
    addInterview: (input) => interviews.addInterview(db, today, input),
    listInterviews: (candidateId) => interviews.listInterviews(db, today, candidateId),
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

// The Interviewer's own calendar day: the app runs on their machine, in their time zone.
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The database the app uses: data/interview-companion.sqlite in the project folder,
// or inside DATA_DIR when it is set. It does not depend on the current directory,
// because an MCP client may start the server from anywhere.
export function defaultDatabasePath(): string {
  const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
  const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(projectRoot, "data");
  return resolve(dataDir, "interview-companion.sqlite");
}
