// The public interface of core. web and mcp import only from this file.
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as aiNotes from "./ai-notes.ts";
import type { AiProviderFactory } from "./ai-provider.ts";
import * as aiSettings from "./ai-settings.ts";
import * as candidateOverview from "./candidate-overview.ts";
import * as candidates from "./candidates.ts";
import { claudeProvider } from "./claude-provider.ts";
import * as cv from "./cv.ts";
import { openDatabase } from "./database.ts";
import * as evidenceSearch from "./evidence-search.ts";
import * as demoCandidate from "./demo-candidate.ts";
import * as interfaceLanguage from "./interface-language.ts";
import * as interviewerNotes from "./interviewer-notes.ts";
import * as interviews from "./interviews.ts";
import * as nameGuess from "./name-guess.ts";
import * as savedQuestions from "./saved-questions.ts";
import * as transcripts from "./transcripts.ts";

export type { AiNote, AiNoteEvidence, AiNoteGeneration, ReviewState } from "./ai-notes.ts";
export type { AiNoteRequest, AiProvider, AiProviderFactory, ProposedAiNote } from "./ai-provider.ts";
export type { CandidateOverview, InterviewOverview } from "./candidate-overview.ts";
export type { Candidate, NewCandidate } from "./candidates.ts";
export type { Cv, CvFile, CvPage, NewCandidateWithCv } from "./cv.ts";
export type {
  EvidenceQuery,
  EvidenceResult,
  EvidenceSearch,
  EvidenceSources,
  Highlight,
  TranscriptEvidence,
} from "./evidence-search.ts";
export {
  AiProviderError,
  InvalidInputError,
  type AiFailure,
  NotFoundError,
  PreconditionError,
  type InputRule,
  type Precondition,
} from "./errors.ts";
export type { InterviewerNote, NewInterviewerNotes, NoteFilter } from "./interviewer-notes.ts";
export type { Interview, NewInterview } from "./interviews.ts";
export type { NewSavedQuestion, QuestionOrigin, SavedQuestion } from "./saved-questions.ts";
export type { Segment, Speaker, SpeakerRole, Transcript, TranscriptFile, TranscriptFormat } from "./transcripts.ts";

export interface Core {
  createCandidate(input: candidates.NewCandidate): candidates.Candidate;
  createCandidateWithCv(input: cv.NewCandidateWithCv): Promise<candidates.Candidate>;
  listCandidates(): candidates.Candidate[];
  getCandidate(id: string): candidates.Candidate | undefined;
  getCandidateOverview(candidateId: string): candidateOverview.CandidateOverview;
  deleteCandidate(id: string): void;
  loadDemoCandidate(): Promise<candidates.Candidate>;
  loadDemoCandidateOnFirstStart(): Promise<candidates.Candidate | undefined>;
  listCandidateRoles(): string[];
  addInterview(input: interviews.NewInterview): interviews.Interview;
  listInterviews(candidateId: string): interviews.Interview[];
  addInterviewerNotes(input: interviewerNotes.NewInterviewerNotes): interviewerNotes.InterviewerNote[];
  editInterviewerNote(id: string, text: string): interviewerNotes.InterviewerNote;
  tagInterviewerNote(id: string, interviewId: string | null): interviewerNotes.InterviewerNote;
  deleteInterviewerNote(id: string): void;
  listInterviewerNotes(candidateId: string, filter?: interviewerNotes.NoteFilter): interviewerNotes.InterviewerNote[];
  getInterfaceLanguage(): string;
  setInterfaceLanguage(language: string): void;
  addSavedQuestion(input: savedQuestions.NewSavedQuestion): savedQuestions.SavedQuestion;
  listSavedQuestions(candidateId: string): savedQuestions.SavedQuestion[];
  editSavedQuestion(id: string, text: string): savedQuestions.SavedQuestion;
  deleteSavedQuestion(id: string): void;
  moveSavedQuestion(id: string, position: number): void;
  attachCv(candidateId: string, file: cv.CvFile): Promise<cv.Cv>;
  getCv(candidateId: string): cv.Cv | undefined;
  readCvFile(candidateId: string): cv.CvFile | undefined;
  guessCandidateName(file: cv.CvFile): Promise<string>;
  importTranscript(interviewId: string, file: transcripts.TranscriptFile): transcripts.Transcript;
  getTranscript(interviewId: string): transcripts.Transcript | undefined;
  listTranscriptFormats(): transcripts.TranscriptFormat[];
  confirmSpeakerMapping(interviewId: string, roles: Record<string, transcripts.SpeakerRole>): transcripts.Transcript;
  searchEvidence(candidateId: string, query: evidenceSearch.EvidenceQuery): evidenceSearch.EvidenceSearch;
  saveApiKey(apiKey: string): void;
  removeApiKey(): void;
  hasApiKey(): boolean;
  generateAiNotes(interviewId: string): Promise<aiNotes.AiNoteGeneration>;
  listAiNotes(interviewId: string): aiNotes.AiNote[];
  close(): void;
}

// The operations that only read. A caller that must never change data gets only these.
const readOperations = [
  "listCandidates",
  "getCandidate",
  "getCandidateOverview",
  "listCandidateRoles",
  "listInterviews",
  "listInterviewerNotes",
  "listSavedQuestions",
  "getCv",
  "getTranscript",
  "listTranscriptFormats",
  "searchEvidence",
] as const satisfies readonly (keyof Core)[];

export type ReadOnlyCore = Pick<Core, (typeof readOperations)[number]>;

// A view of core that holds only the read operations. Write operations are not hidden behind a
// type: they are absent from the object, so not even a type cast can reach them.
export function readOnlyCore(core: Core): ReadOnlyCore {
  return Object.fromEntries(readOperations.map((name) => [name, core[name]])) as unknown as ReadOnlyCore;
}

export interface CoreOptions {
  // Today as YYYY-MM-DD. Defaults to the day on this computer's clock; tests fix it.
  today?: interviews.Today;
  // The current time, used as the time a note is saved. Defaults to the system clock; tests fix it.
  now?: interviewerNotes.Now;
  // Makes the model provider for AI generation. Defaults to Claude; tests use a fake provider.
  aiProvider?: AiProviderFactory;
}

// Opens (and creates, if needed) the database file at dbPath and brings its schema up to date.
export function openCore(dbPath: string, options: CoreOptions = {}): Core {
  mkdirSync(dirname(dbPath), { recursive: true });
  const { db, created } = openDatabase(dbPath);
  if (created) demoCandidate.markDemoPending(db);
  const today = options.today ?? localToday;
  const now = options.now ?? (() => new Date());
  const aiProvider = options.aiProvider ?? claudeProvider;
  // CV files live in a folder next to the database file.
  const cvFolder = join(dirname(dbPath), "cv-files");
  return {
    createCandidate: (input) => candidates.createCandidate(db, input),
    createCandidateWithCv: (input) => cv.createCandidateWithCv(db, cvFolder, now, input),
    listCandidates: () => candidates.listCandidates(db),
    getCandidate: (id) => candidates.getCandidate(db, id),
    getCandidateOverview: (candidateId) => candidateOverview.getCandidateOverview(db, today, candidateId),
    deleteCandidate: (id) => cv.deleteCandidateAndCv(db, cvFolder, id),
    loadDemoCandidate: () => demoCandidate.loadDemoCandidate(db, cvFolder, today, now),
    loadDemoCandidateOnFirstStart: () => demoCandidate.loadDemoCandidateOnFirstStart(db, cvFolder, today, now),
    listCandidateRoles: () => candidates.listCandidateRoles(db),
    addInterview: (input) => interviews.addInterview(db, today, input),
    listInterviews: (candidateId) => interviews.listInterviews(db, today, candidateId),
    addInterviewerNotes: (input) => interviewerNotes.addInterviewerNotes(db, now, input),
    editInterviewerNote: (id, text) => interviewerNotes.editInterviewerNote(db, id, text),
    tagInterviewerNote: (id, interviewId) => interviewerNotes.tagInterviewerNote(db, id, interviewId),
    deleteInterviewerNote: (id) => interviewerNotes.deleteInterviewerNote(db, id),
    listInterviewerNotes: (candidateId, filter) => interviewerNotes.listInterviewerNotes(db, candidateId, filter),
    getInterfaceLanguage: () => interfaceLanguage.getInterfaceLanguage(db),
    setInterfaceLanguage: (language) => interfaceLanguage.setInterfaceLanguage(db, language),
    addSavedQuestion: (input) => savedQuestions.addSavedQuestion(db, input),
    listSavedQuestions: (candidateId) => savedQuestions.listSavedQuestions(db, candidateId),
    editSavedQuestion: (id, text) => savedQuestions.editSavedQuestion(db, id, text),
    deleteSavedQuestion: (id) => savedQuestions.deleteSavedQuestion(db, id),
    moveSavedQuestion: (id, position) => savedQuestions.moveSavedQuestion(db, id, position),
    attachCv: (candidateId, file) => cv.attachCv(db, cvFolder, now, candidateId, file),
    getCv: (candidateId) => cv.getCv(db, candidateId),
    readCvFile: (candidateId) => cv.readCvFile(db, cvFolder, candidateId),
    guessCandidateName: (file) => nameGuess.guessCandidateName(file),
    importTranscript: (interviewId, file) => transcripts.importTranscript(db, now, interviewId, file),
    getTranscript: (interviewId) => transcripts.getTranscript(db, interviewId),
    listTranscriptFormats: () => transcripts.listTranscriptFormats(),
    confirmSpeakerMapping: (interviewId, roles) => transcripts.confirmSpeakerMapping(db, now, interviewId, roles),
    searchEvidence: (candidateId, query) => evidenceSearch.searchEvidence(db, today, candidateId, query),
    saveApiKey: (apiKey) => aiSettings.saveApiKey(db, apiKey),
    removeApiKey: () => aiSettings.removeApiKey(db),
    hasApiKey: () => aiSettings.hasApiKey(db),
    generateAiNotes: (interviewId) => aiNotes.generateAiNotes(db, now, aiProvider, interviewId),
    listAiNotes: (interviewId) => aiNotes.listAiNotes(db, interviewId),
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
