import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AiSource } from "./ai-notes.ts";
import type { AiProviderFactory, ProposedAskedQuestion } from "./ai-provider.ts";
import { readApiKey, requireAiClientWrites } from "./ai-settings.ts";
import { inTransaction } from "./database.ts";
import { PreconditionError } from "./errors.ts";
import { getInterfaceLanguage } from "./interface-language.ts";
import type { Now } from "./interviewer-notes.ts";
import { candidateOfInterview, listInterviews, requireInterview, type Today } from "./interviews.ts";
import { containsQuote } from "./quotes.ts";
import { findSavedQuestion, listSavedQuestions, markSavedQuestion, type SavedQuestion } from "./saved-questions.ts";
import {
  callModel,
  requireConfirmedTranscript,
  requireTranscriptUnchanged,
  segmentsOf,
  segmentsWithRoles,
} from "./transcript-ai.ts";
import { getTranscript, type Transcript } from "./transcripts.ts";

// A quote from one Transcript segment, by its number.
export interface SegmentQuote {
  segmentNumber: number;
  quote: string;
}

// A question the Interviewer asked in one Interview, found by AI in its Transcript, with an
// Answer Summary: a short, neutral account of what the Candidate answered.
export interface AskedQuestion {
  id: string;
  interviewId: string;
  // The question in a few words, in the interface language at the time it was found.
  question: string;
  // Where the Interviewer asked it.
  questionEvidence: SegmentQuote;
  answerSummary: string;
  // What the Candidate said, from their own segments, at or after the question.
  answerEvidence: SegmentQuote[];
  // The Saved Question this one matches, or null.
  savedQuestionId: string | null;
  // The exchange in the Transcript: from the question to the end of the answer, which is the
  // last segment before the Interviewer speaks again after the last quote.
  firstSegment: number;
  lastSegment: number;
  source: AiSource;
  // True when the Speaker Mapping was confirmed again after the questions were found.
  stale: boolean;
}

// One Interview's Asked Questions, or null from listAskedQuestions when they were never found.
export interface AskedQuestions {
  foundAt: string;
  stale: boolean;
  askedQuestions: AskedQuestion[];
}

export interface AskedQuestionGeneration {
  askedQuestions: AskedQuestion[];
  // How many proposed questions were dropped because a quote was not found where it should be.
  dropped: number;
}

export async function findAskedQuestions(
  db: DatabaseSync,
  now: Now,
  providerFor: AiProviderFactory,
  interviewId: string,
): Promise<AskedQuestionGeneration> {
  const transcript = requireConfirmedTranscript(db, interviewId);
  const apiKey = readApiKey(db);
  if (apiKey === undefined) throw new PreconditionError("apiKeyMissing", "Add an API key to find the questions asked.");
  const savedQuestions = savedQuestionsOf(db, transcript).map(({ id, text }) => ({ id, text }));
  const proposed = await callModel(() =>
    providerFor(apiKey).proposeAskedQuestions({
      language: getInterfaceLanguage(db),
      segments: segmentsWithRoles(transcript),
      savedQuestions,
    }),
  );
  requireTranscriptUnchanged(db, transcript);
  return accept(db, now, transcript, proposed, savedQuestions.map((q) => q.id), "app");
}

// Saves the Asked Questions the AI client found itself, through MCP, with no API key in the app.
// They go through the same gate and the same quote check as the app's own. The client was given
// the Saved Questions as they are now.
export function saveAskedQuestionsFromClient(
  db: DatabaseSync,
  now: Now,
  interviewId: string,
  proposed: ProposedAskedQuestion[],
): AskedQuestionGeneration {
  requireAiClientWrites(db);
  return saveCheckedAskedQuestions(db, now, interviewId, proposed, "aiClient");
}

// Saves Asked Questions written elsewhere, such as the demo's or an imported Candidate's, through
// the confirmed-Transcript gate and the quote check. The Saved Questions counted as checked are
// those given, or every current one. It does not check the AI client switch.
export function saveCheckedAskedQuestions(
  db: DatabaseSync,
  now: Now,
  interviewId: string,
  proposed: ProposedAskedQuestion[],
  source: AiSource,
  checkedIds?: string[],
): AskedQuestionGeneration {
  const transcript = requireConfirmedTranscript(db, interviewId);
  return accept(db, now, transcript, proposed, checkedIds ?? savedQuestionsOf(db, transcript).map((q) => q.id), source);
}

// The Candidate's Saved Questions, which the model may match.
function savedQuestionsOf(db: DatabaseSync, transcript: Transcript) {
  return listSavedQuestions(db, candidateOfInterview(db, transcript.interviewId));
}

// Keeps the proposed questions whose quotes are all found and saves them in place of the
// Interview's earlier ones, with the Saved Questions that were checked.
function accept(
  db: DatabaseSync,
  now: Now,
  transcript: Transcript,
  proposed: ProposedAskedQuestion[],
  // The Saved Questions the model was given; only these count as checked.
  checkedIds: string[],
  source: AiSource,
): AskedQuestionGeneration {
  const interviewerSegments = segmentsOf(transcript, "interviewer");
  const candidateSegments = segmentsOf(transcript, "candidate");
  const backed = proposed.filter((asked) => isBacked(asked, interviewerSegments, candidateSegments));
  // An answer with nothing usable, empty or all dropped, never wipes questions found earlier.
  if (backed.length > 0 || listAskedQuestions(db, transcript.interviewId) === null) {
    // A Saved Question deleted while the model was answering is no longer there to link or check.
    const current = new Set(savedQuestionsOf(db, transcript).map((question) => question.id));
    const savedIds = new Set(checkedIds.filter((id) => current.has(id)));
    save(db, now, transcript.interviewId, backed, savedIds, source);
  }
  return {
    askedQuestions: listAskedQuestions(db, transcript.interviewId)?.askedQuestions ?? [],
    dropped: proposed.length - backed.length,
  };
}

// The check that makes an Asked Question trustworthy, done in code: the question is quoted word
// for word from an Interviewer segment, and the answer from at least one Candidate segment at or
// after it. A question that fails any part is dropped whole.
function isBacked(
  asked: ProposedAskedQuestion,
  interviewerSegments: Map<number, string>,
  candidateSegments: Map<number, string>,
): boolean {
  if (asked.question.trim() === "" || asked.answerSummary.trim() === "" || asked.answerEvidence.length === 0) return false;
  const { segmentNumber, quote } = asked.questionEvidence;
  if (!containsQuote(interviewerSegments.get(segmentNumber), quote)) return false;
  return asked.answerEvidence.every(
    (evidence) => evidence.segmentNumber >= segmentNumber && containsQuote(candidateSegments.get(evidence.segmentNumber), evidence.quote),
  );
}

function save(
  db: DatabaseSync,
  now: Now,
  interviewId: string,
  questions: ProposedAskedQuestion[],
  savedIds: Set<string>,
  source: AiSource,
): void {
  inTransaction(db, () => {
    db.prepare("DELETE FROM asked_question_run WHERE interview_id = ?").run(interviewId);
    db.prepare("INSERT INTO asked_question_run (interview_id, found_at, source) VALUES (?, ?, ?)").run(
      interviewId,
      now().toISOString(),
      source,
    );
    const insertQuestion = db.prepare(
      `INSERT INTO asked_question (id, interview_id, position, question, question_segment, question_quote, answer_summary, saved_question_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertChecked = db.prepare("INSERT INTO asked_question_checked (interview_id, saved_question_id) VALUES (?, ?)");
    for (const savedQuestionId of savedIds) insertChecked.run(interviewId, savedQuestionId);
    const insertEvidence = db.prepare(
      "INSERT INTO asked_question_evidence (asked_question_id, position, segment_number, quote) VALUES (?, ?, ?, ?)",
    );
    for (const [i, asked] of questions.entries()) {
      const id = randomUUID();
      // A Saved Question the model names but the Candidate does not have is only a wrong match.
      const savedQuestionId = asked.savedQuestionId !== null && savedIds.has(asked.savedQuestionId) ? asked.savedQuestionId : null;
      insertQuestion.run(
        id,
        interviewId,
        i + 1,
        asked.question.trim(),
        asked.questionEvidence.segmentNumber,
        asked.questionEvidence.quote,
        asked.answerSummary.trim(),
        savedQuestionId,
      );
      for (const [j, evidence] of asked.answerEvidence.entries()) {
        insertEvidence.run(id, j + 1, evidence.segmentNumber, evidence.quote);
      }
    }
  });
}

interface RunRow {
  found_at: string;
  source: AiSource;
  stale: number;
}

interface QuestionRow {
  id: string;
  question: string;
  question_segment: number;
  question_quote: string;
  answer_summary: string;
  saved_question_id: string | null;
}

// The Interview's Asked Questions in the order they were asked, or null when they were never found.
export function listAskedQuestions(db: DatabaseSync, interviewId: string): AskedQuestions | null {
  requireInterview(db, interviewId);
  const run = db
    .prepare(
      `SELECT found_at, source, found_at < speaker_mapping_confirmed_at AS stale
       FROM asked_question_run JOIN transcript USING (interview_id) WHERE interview_id = ?`,
    )
    .get(interviewId) as RunRow | undefined;
  if (!run) return null;
  const rows = db
    .prepare(
      `SELECT id, question, question_segment, question_quote, answer_summary, saved_question_id
       FROM asked_question WHERE interview_id = ? ORDER BY position`,
    )
    .all(interviewId) as unknown as QuestionRow[];
  const evidenceOf = db.prepare(
    "SELECT segment_number, quote FROM asked_question_evidence WHERE asked_question_id = ? ORDER BY position",
  );
  const stale = run.stale === 1;
  const roles = new Map(segmentsWithRoles(getTranscript(db, interviewId)!).map((s) => [s.number, s.role]));
  // The answer goes on past its last quote until the Interviewer speaks again.
  const endOfAnswer = (lastQuoted: number) => {
    let end = lastQuoted;
    while (roles.has(end + 1) && roles.get(end + 1) !== "interviewer") end += 1;
    return end;
  };
  return {
    foundAt: run.found_at,
    stale,
    askedQuestions: rows.map((row): AskedQuestion => {
      const answerEvidence = (evidenceOf.all(row.id) as unknown as { segment_number: number; quote: string }[]).map(
        (e) => ({ segmentNumber: e.segment_number, quote: e.quote }),
      );
      return {
        id: row.id,
        interviewId,
        question: row.question,
        questionEvidence: { segmentNumber: row.question_segment, quote: row.question_quote },
        answerSummary: row.answer_summary,
        answerEvidence,
        savedQuestionId: row.saved_question_id,
        firstSegment: row.question_segment,
        lastSegment: endOfAnswer(Math.max(row.question_segment, ...answerEvidence.map((e) => e.segmentNumber))),
        source: run.source,
        stale,
      };
    }),
  };
}

// Who found the Interview's Asked Questions and which Saved Questions were checked, for an export,
// or null when they were never found.
export function askedQuestionRunOf(db: DatabaseSync, interviewId: string): { source: AiSource; checkedIds: string[] } | null {
  const run = db.prepare("SELECT source FROM asked_question_run WHERE interview_id = ?").get(interviewId) as
    | { source: AiSource }
    | undefined;
  if (!run) return null;
  const checked = db
    .prepare("SELECT saved_question_id FROM asked_question_checked WHERE interview_id = ?")
    .all(interviewId) as unknown as { saved_question_id: string }[];
  return { source: run.source, checkedIds: checked.map((row) => row.saved_question_id) };
}

// Where one Saved Question stands in one Interview whose questions were found: the Asked Question
// it matched, or null when it was not found in that Transcript.
export interface SavedQuestionCheck {
  savedQuestionId: string;
  interviewId: string;
  askedQuestion: AskedQuestion | null;
  stale: boolean;
}

// Every Saved Question that was checked, in the Interviewer's order, each in Interview order. A
// Saved Question written after an Interview's questions were found has no entry for it.
export function listSavedQuestionChecks(db: DatabaseSync, today: Today, candidateId: string): SavedQuestionCheck[] {
  const saved = listSavedQuestions(db, candidateId);
  const isChecked = db.prepare("SELECT 1 FROM asked_question_checked WHERE interview_id = ? AND saved_question_id = ?");
  const found = listInterviews(db, today, candidateId).flatMap((interview) => {
    const asked = listAskedQuestions(db, interview.id);
    return asked ? [{ interviewId: interview.id, asked }] : [];
  });
  return saved.flatMap((question) =>
    found
      .filter(({ interviewId }) => isChecked.get(interviewId, question.id) !== undefined)
      .map(({ interviewId, asked }) => ({
        savedQuestionId: question.id,
        interviewId,
        askedQuestion: asked.askedQuestions.find((a) => a.savedQuestionId === question.id) ?? null,
        stale: asked.stale,
      })),
  );
}

// What the Transcripts say about a Saved Question across all of the Candidate's Interviews: asked
// in at least one; looked for in at least one Transcript and not found in any; or planned, when no
// Transcript has been checked for it yet.
export type QuestionState = "asked" | "notFound" | "planned";

// Where a Saved Question stands. The Interviewer's mark decides when there is one: asked, or
// planned for a question marked as not asked. Without a mark the Transcripts decide.
export interface SavedQuestionState {
  savedQuestionId: string;
  state: QuestionState;
  decidedBy: "interviewer" | "transcripts";
  // What the Transcripts say, whoever decided.
  transcriptState: QuestionState;
  // True when the Interviewer's mark says the opposite of what a checked Transcript says.
  differsFromTranscripts: boolean;
}

// One state for every Saved Question, in the Interviewer's order.
export function listSavedQuestionStates(db: DatabaseSync, today: Today, candidateId: string): SavedQuestionState[] {
  const checks = listSavedQuestionChecks(db, today, candidateId);
  return listSavedQuestions(db, candidateId).map((question): SavedQuestionState => {
    const own = checks.filter((check) => check.savedQuestionId === question.id);
    const transcriptState = own.some((check) => check.askedQuestion !== null) ? "asked" : own.length > 0 ? "notFound" : "planned";
    if (question.mark === null) {
      return { savedQuestionId: question.id, state: transcriptState, decidedBy: "transcripts", transcriptState, differsFromTranscripts: false };
    }
    return {
      savedQuestionId: question.id,
      state: question.mark === "asked" ? "asked" : "planned",
      decidedBy: "interviewer",
      transcriptState,
      // A Transcript that was never checked for the question says nothing, so nothing differs.
      differsFromTranscripts: transcriptState !== "planned" && (question.mark === "asked") !== (transcriptState === "asked"),
    };
  });
}

// Records the Interviewer's word on whether a Saved Question was asked. A mark is kept only when
// it says something the Transcripts do not: saying what they already say removes the mark, so the
// question follows the Transcripts again. Refuses an unknown question with NotFoundError.
export function setSavedQuestionAsked(db: DatabaseSync, today: Today, id: string, asked: boolean): SavedQuestion {
  const question = findSavedQuestion(db, id);
  const { transcriptState } = listSavedQuestionStates(db, today, question.candidateId).find((state) => state.savedQuestionId === id)!;
  const transcriptsSayAsked = transcriptState === "asked";
  return markSavedQuestion(db, id, asked === transcriptsSayAsked ? null : asked ? "asked" : "notAsked");
}
