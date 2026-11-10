import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AiProviderFactory, ProposedQuestion, ProposedQuestionEvidence, QuestionRequest } from "./ai-provider.ts";
import { readApiKey } from "./ai-settings.ts";
import { requireCandidate } from "./candidates.ts";
import { getCv } from "./cv.ts";
import { inTransaction } from "./database.ts";
import { AiProviderError, InvalidInputError, NotFoundError, PreconditionError } from "./errors.ts";
import { getInterfaceLanguage } from "./interface-language.ts";
import type { Now } from "./interviewer-notes.ts";
import { listInterviewerNotes } from "./interviewer-notes.ts";
import { listInterviews, type Today } from "./interviews.ts";
import { insertSavedQuestion, listSavedQuestions, type SavedQuestion } from "./saved-questions.ts";
import { getTranscript } from "./transcripts.ts";

// One exact excerpt a Suggested Question cites: part of a CV page or of a Transcript segment.
// It has the same shape as what the model proposes; only checked quotes are stored.
export type SuggestionEvidence = ProposedQuestionEvidence;

export interface SuggestedQuestion {
  id: string;
  candidateId: string;
  // The question, as the model proposed it or as the Interviewer edited it before accepting.
  text: string;
  // One short line on why the question is worth asking.
  reason: string;
  generatedAt: string;
  // True when the suggestion cites no Evidence: a general question, not based on the CV or a Transcript.
  general: boolean;
  // True once it was copied into Saved Questions. Regenerating keeps accepted suggestions.
  accepted: boolean;
  // Hidden from the list; it can be shown again until suggestions are regenerated.
  dismissed: boolean;
  evidence: SuggestionEvidence[];
}

export interface SuggestedQuestionGeneration {
  // All of the Candidate's suggestions after generation, newest first.
  suggestions: SuggestedQuestion[];
  // How many proposed suggestions were dropped because a quote was not found in its source.
  dropped: number;
  // Interviews whose Transcript was not sent because its Speaker Mapping is not confirmed.
  leftOut: string[];
}

export interface QuestionFocus {
  // What the questions should be about. Empty or missing means no focus.
  focus?: string | null;
}

// A source as it was when it was sent. Its text is what quotes are checked against, and its
// stamp shows whether it was replaced while the model was answering.
interface SentSources {
  cv: { stamp: string; pages: Map<number, string> } | undefined;
  transcripts: Map<string, { stamp: string; segments: Map<number, string> }>;
}

export async function generateSuggestedQuestions(
  db: DatabaseSync,
  today: Today,
  now: Now,
  providerFor: AiProviderFactory,
  candidateId: string,
  options: QuestionFocus = {},
): Promise<SuggestedQuestionGeneration> {
  requireCandidate(db, candidateId);
  const apiKey = readApiKey(db);
  if (apiKey === undefined) {
    throw new PreconditionError("apiKeyMissing", "Add an API key to suggest questions.");
  }
  const focus = options.focus?.trim() || null;
  const { request, sent, leftOut } = buildRequest(db, today, candidateId, focus);
  let proposed: ProposedQuestion[];
  try {
    proposed = await providerFor(apiKey).proposeQuestions(request);
  } catch (error) {
    throw error instanceof AiProviderError
      ? error
      : new AiProviderError("unavailable", "Generation failed. Your data was not changed.", { cause: error });
  }
  const current = currentStamps(db, candidateId);
  const backed = proposed.filter((suggestion) => isBacked(suggestion, sent, current));
  // An answer with nothing usable does not cost the Interviewer the suggestions they already have.
  if (backed.length > 0) saveSuggestions(db, now, candidateId, backed);
  return { suggestions: listSuggestedQuestions(db, candidateId), dropped: proposed.length - backed.length, leftOut };
}

function buildRequest(
  db: DatabaseSync,
  today: Today,
  candidateId: string,
  focus: string | null,
): { request: QuestionRequest; sent: SentSources; leftOut: string[] } {
  const cv = getCv(db, candidateId);
  const sent: SentSources = {
    cv: cv && { stamp: cv.uploadedAt, pages: new Map(cv.pages.map((page) => [page.number, page.text])) },
    transcripts: new Map(),
  };
  const leftOut: string[] = [];
  const transcripts: QuestionRequest["transcripts"] = [];
  for (const interview of listInterviews(db, today, candidateId)) {
    const transcript = getTranscript(db, interview.id);
    if (!transcript) continue;
    // Without a confirmed mapping nobody knows who said what, so it is not sent at all.
    if (transcript.speakerMappingConfirmedAt === null) {
      leftOut.push(interview.id);
      continue;
    }
    const roles = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker.role!]));
    transcripts.push({
      interviewId: interview.id,
      interviewNumber: interview.number,
      segments: transcript.segments.map((segment) => ({
        number: segment.number,
        role: roles.get(segment.speakerId)!,
        text: segment.text,
      })),
    });
    sent.transcripts.set(interview.id, {
      stamp: transcriptStamp(transcript.importedAt, transcript.speakerMappingConfirmedAt),
      segments: new Map(transcript.segments.map((segment) => [segment.number, segment.text])),
    });
  }
  const request: QuestionRequest = {
    language: getInterfaceLanguage(db),
    focus,
    cvPages: cv?.pages.map((page) => ({ number: page.number, text: page.text })) ?? [],
    transcripts,
    interviewerNotes: listInterviewerNotes(db, candidateId).map((note) => note.text),
    savedQuestions: listSavedQuestions(db, candidateId).map((question) => question.text),
  };
  return { request, sent, leftOut };
}

function transcriptStamp(importedAt: string, confirmedAt: string | null): string {
  return `${importedAt}|${confirmedAt}`;
}

// What identifies the version of each source: the CV's upload time, and for each Interview its
// Transcript's import time with its Speaker Mapping's confirmation time.
interface SourceStamps {
  cv: string | undefined;
  transcripts: Map<string, string>;
}

// The stamps of the sources as they are now, after the model answered.
function currentStamps(db: DatabaseSync, candidateId: string): SourceStamps {
  const rows = db
    .prepare(
      `SELECT transcript.interview_id, imported_at, speaker_mapping_confirmed_at FROM transcript
       JOIN interview ON interview.id = transcript.interview_id WHERE interview.candidate_id = ?`,
    )
    .all(candidateId) as unknown as { interview_id: string; imported_at: string; speaker_mapping_confirmed_at: string | null }[];
  return {
    cv: getCv(db, candidateId)?.uploadedAt,
    transcripts: new Map(
      rows.map((row) => [row.interview_id, transcriptStamp(row.imported_at, row.speaker_mapping_confirmed_at)]),
    ),
  };
}

// The same guarantee as for AI Notes, checked in code: a suggestion has a question and a reason,
// and every quote it cites appears word for word in a source that was sent and is still the same.
// A suggestion with no quotes is a general question and is kept. One failing quote drops it whole.
function isBacked(
  suggestion: ProposedQuestion,
  sent: SentSources,
  current: SourceStamps,
): boolean {
  if (suggestion.question.trim() === "" || suggestion.reason.trim() === "") return false;
  return suggestion.evidence.every((evidence) => {
    if (evidence.quote.trim() === "") return false;
    if (evidence.source === "cv") {
      if (!sent.cv || sent.cv.stamp !== current.cv) return false;
      return sent.cv.pages.get(evidence.page)?.includes(evidence.quote) ?? false;
    }
    const transcript = sent.transcripts.get(evidence.interviewId);
    if (!transcript || transcript.stamp !== current.transcripts.get(evidence.interviewId)) return false;
    return transcript.segments.get(evidence.segmentNumber)?.includes(evidence.quote) ?? false;
  });
}

function saveSuggestions(db: DatabaseSync, now: Now, candidateId: string, suggestions: ProposedQuestion[]): void {
  const generatedAt = now().toISOString();
  inTransaction(db, () => {
    // Accepted suggestions stay; every other one, dismissed or edited, is replaced.
    db.prepare("DELETE FROM suggested_question WHERE candidate_id = ? AND accepted_at IS NULL").run(candidateId);
    const insertSuggestion = db.prepare(
      "INSERT INTO suggested_question (id, candidate_id, text, reason, generated_at, position) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const insertEvidence = db.prepare(
      `INSERT INTO suggested_question_evidence
         (suggested_question_id, position, cv_candidate_id, cv_page, transcript_interview_id, segment_number, quote)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [i, suggestion] of suggestions.entries()) {
      const id = randomUUID();
      insertSuggestion.run(id, candidateId, suggestion.question.trim(), suggestion.reason.trim(), generatedAt, i + 1);
      for (const [j, evidence] of suggestion.evidence.entries()) {
        if (evidence.source === "cv") {
          insertEvidence.run(id, j + 1, candidateId, evidence.page, null, null, evidence.quote);
        } else {
          insertEvidence.run(id, j + 1, null, null, evidence.interviewId, evidence.segmentNumber, evidence.quote);
        }
      }
    }
  });
}

// The newest generation first, each in the order the model gave its suggestions. Dismissed
// suggestions are included, marked as such.
export function listSuggestedQuestions(db: DatabaseSync, candidateId: string): SuggestedQuestion[] {
  requireCandidate(db, candidateId);
  const rows = db
    .prepare(`${selectSuggestions} WHERE candidate_id = ? ORDER BY generated_at DESC, position`)
    .all(candidateId) as unknown as SuggestionRow[];
  return toSuggestedQuestions(db, rows);
}

function getSuggestedQuestion(db: DatabaseSync, id: string): SuggestedQuestion {
  const row = db.prepare(`${selectSuggestions} WHERE id = ?`).get(id) as unknown as SuggestionRow | undefined;
  if (!row) throw new NotFoundError("This suggestion does not exist.");
  return toSuggestedQuestions(db, [row])[0]!;
}

// Accepting and editing work on a suggestion that is shown and not yet accepted. Once
// accepted, the Saved Question is the copy to change.
function requireOpen(suggestion: SuggestedQuestion): void {
  if (suggestion.dismissed) {
    throw new PreconditionError("suggestionDismissed", "This suggestion was dismissed. Show it again first.");
  }
  if (suggestion.accepted) {
    throw new PreconditionError("suggestionAccepted", "This suggestion is already in your questions.");
  }
}

// Copies the suggestion's question to the end of the Candidate's Saved Questions, as "from a
// suggestion". The suggestion stays, marked accepted, and regenerating keeps it.
export function acceptSuggestedQuestion(db: DatabaseSync, now: Now, id: string): SavedQuestion {
  const suggestion = getSuggestedQuestion(db, id);
  requireOpen(suggestion);
  const acceptedAt = now().toISOString();
  return inTransaction(db, () => {
    db.prepare("UPDATE suggested_question SET accepted_at = ? WHERE id = ?").run(acceptedAt, id);
    return insertSavedQuestion(db, suggestion.candidateId, suggestion.text, "suggestion", acceptedAt);
  });
}

// Changes the question before it is accepted. The reason and Evidence stay as the AI gave them.
export function editSuggestedQuestion(db: DatabaseSync, id: string, text: string): SuggestedQuestion {
  const trimmed = text.trim();
  if (trimmed === "") throw new InvalidInputError("text", "required", "A question needs text.");
  requireOpen(getSuggestedQuestion(db, id));
  db.prepare("UPDATE suggested_question SET text = ? WHERE id = ?").run(trimmed, id);
  return getSuggestedQuestion(db, id);
}

// Hidden from the list, not deleted, so it can be shown again until the next generation.
export function dismissSuggestedQuestion(db: DatabaseSync, id: string): SuggestedQuestion {
  getSuggestedQuestion(db, id);
  db.prepare("UPDATE suggested_question SET dismissed = 1 WHERE id = ?").run(id);
  return getSuggestedQuestion(db, id);
}

export function restoreSuggestedQuestion(db: DatabaseSync, id: string): SuggestedQuestion {
  getSuggestedQuestion(db, id);
  db.prepare("UPDATE suggested_question SET dismissed = 0 WHERE id = ?").run(id);
  return getSuggestedQuestion(db, id);
}

const selectSuggestions = "SELECT id, candidate_id, text, reason, generated_at, accepted_at, dismissed FROM suggested_question";

interface SuggestionRow {
  id: string;
  candidate_id: string;
  text: string;
  reason: string;
  generated_at: string;
  accepted_at: string | null;
  dismissed: number;
}

interface EvidenceRow {
  cv_page: number | null;
  transcript_interview_id: string | null;
  segment_number: number | null;
  quote: string;
}

function toSuggestedQuestions(db: DatabaseSync, rows: SuggestionRow[]): SuggestedQuestion[] {
  const evidenceOf = db.prepare(
    `SELECT cv_page, transcript_interview_id, segment_number, quote FROM suggested_question_evidence
     WHERE suggested_question_id = ? ORDER BY position`,
  );
  return rows.map((row) => {
    const evidence = (evidenceOf.all(row.id) as unknown as EvidenceRow[]).map(
      (e): SuggestionEvidence =>
        e.transcript_interview_id === null
          ? { source: "cv", page: e.cv_page!, quote: e.quote }
          : { source: "transcript", interviewId: e.transcript_interview_id, segmentNumber: e.segment_number!, quote: e.quote },
    );
    return {
      id: row.id,
      candidateId: row.candidate_id,
      text: row.text,
      reason: row.reason,
      generatedAt: row.generated_at,
      general: evidence.length === 0,
      accepted: row.accepted_at !== null,
      dismissed: row.dismissed === 1,
      evidence,
    };
  });
}
