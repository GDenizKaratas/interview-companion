import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AiProviderFactory, ProposedAiNote } from "./ai-provider.ts";
import { readApiKey, requireAiClientWrites } from "./ai-settings.ts";
import { getTranscript, type Transcript } from "./transcripts.ts";
import { inTransaction } from "./database.ts";
import { AiProviderError, InvalidInputError, NotFoundError, PreconditionError } from "./errors.ts";
import { getInterfaceLanguage } from "./interface-language.ts";
import type { Now } from "./interviewer-notes.ts";
import { requireInterview } from "./interviews.ts";

export type ReviewState = "unreviewed" | "confirmed" | "corrected" | "dismissed";

// Who wrote an AI Note: the app, with the Interviewer's API key, or the AI client through MCP.
// Both went through the same checks.
export type AiSource = "app" | "aiClient";

export interface AiNoteEvidence {
  // The Transcript segment the quote comes from, numbered from 1.
  segmentNumber: number;
  // Exactly as it appears in that segment.
  quote: string;
}

export interface AiNote {
  id: string;
  interviewId: string;
  // The AI's statement, in the interface language at the time it was generated. It never changes.
  statement: string;
  // The Interviewer's rewrite when the note is Corrected, kept even if the note is later Dismissed.
  correction: string | null;
  reviewState: ReviewState;
  generatedAt: string;
  source: AiSource;
  // True when the Speaker Mapping was confirmed again after the note was generated: the note
  // may credit words to the wrong speaker, so it is not trusted until regenerated.
  stale: boolean;
  evidence: AiNoteEvidence[];
}

export interface AiNoteGeneration {
  // The notes that passed the quote check and were saved, in the order the model gave them.
  notes: AiNote[];
  // How many proposed notes were dropped because a quote was not found in its source.
  dropped: number;
}

export async function generateAiNotes(
  db: DatabaseSync,
  now: Now,
  providerFor: AiProviderFactory,
  interviewId: string,
): Promise<AiNoteGeneration> {
  const transcript = requireConfirmedTranscript(db, interviewId);
  const apiKey = readApiKey(db);
  if (apiKey === undefined) throw new PreconditionError("apiKeyMissing", "Add an API key to generate AI Notes.");
  const roles = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker.role!]));
  let proposed: ProposedAiNote[];
  try {
    proposed = await providerFor(apiKey).proposeAiNotes({
      language: getInterfaceLanguage(db),
      segments: transcript.segments.map((segment) => ({
        number: segment.number,
        role: roles.get(segment.speakerId)!,
        text: segment.text,
      })),
    });
  } catch (error) {
    throw error instanceof AiProviderError
      ? error
      : new AiProviderError("unavailable", "Generation failed. Your data was not changed.", { cause: error });
  }
  // The model takes a while. If the Transcript was replaced or its mapping confirmed again
  // meanwhile, the answer rests on data that is gone, so it is not saved.
  const current = getTranscript(db, interviewId);
  if (
    current?.importedAt !== transcript.importedAt ||
    current.speakerMappingConfirmedAt !== transcript.speakerMappingConfirmedAt
  ) {
    throw new PreconditionError(
      "transcriptChanged",
      "The Transcript or its speakers changed during generation. Nothing was saved; generate again.",
    );
  }
  return acceptNotes(db, now, transcript, proposed, "app");
}

// Saves the AI Notes the AI client wrote itself, through MCP, with no API key in the app. They
// go through the same gate and the same quote check as notes the app generates.
export function saveAiNotesFromClient(db: DatabaseSync, now: Now, interviewId: string, proposed: ProposedAiNote[]): AiNoteGeneration {
  requireAiClientWrites(db);
  return acceptNotes(db, now, requireConfirmedTranscript(db, interviewId), proposed, "aiClient");
}

// AI Notes need a Transcript whose speakers are confirmed, so every quote is known to be the Candidate's.
function requireConfirmedTranscript(db: DatabaseSync, interviewId: string): Transcript {
  requireInterview(db, interviewId);
  const transcript = getTranscript(db, interviewId);
  if (!transcript) throw new PreconditionError("noTranscript", "Import a Transcript before generating AI Notes.");
  if (transcript.speakerMappingConfirmedAt === null) {
    throw new PreconditionError(
      "speakerMappingNotConfirmed",
      "Confirm who is speaking before generating AI Notes.",
    );
  }
  return transcript;
}

// Keeps the proposed notes that pass the quote check and saves them, Unreviewed.
function acceptNotes(
  db: DatabaseSync,
  now: Now,
  transcript: Transcript,
  proposed: ProposedAiNote[],
  source: AiSource,
): AiNoteGeneration {
  const roles = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker.role!]));
  const candidateSegments = new Map(
    transcript.segments
      .filter((segment) => roles.get(segment.speakerId) === "candidate")
      .map((segment) => [segment.number, segment.text]),
  );
  const backed = proposed.filter((note) => isBacked(note, candidateSegments));
  // An answer with nothing usable does not cost the Interviewer the notes they already have.
  if (backed.length > 0) saveNotes(db, now, transcript.interviewId, backed, source);
  return { notes: listAiNotes(db, transcript.interviewId), dropped: proposed.length - backed.length };
}

// The check that makes an AI Note trustworthy, done in code rather than asked of the model:
// the note has a statement and at least one quote, and every quote appears word for word in
// the segment it cites, which must be the Candidate's. A note that fails any part is dropped whole.
function isBacked(note: ProposedAiNote, candidateSegments: Map<number, string>): boolean {
  if (note.statement.trim() === "" || note.evidence.length === 0) return false;
  return note.evidence.every((evidence) => {
    const text = candidateSegments.get(evidence.segmentNumber);
    return text !== undefined && evidence.quote.trim() !== "" && text.includes(evidence.quote);
  });
}

function saveNotes(db: DatabaseSync, now: Now, interviewId: string, notes: ProposedAiNote[], source: AiSource): void {
  const generatedAt = now().toISOString();
  inTransaction(db, () => {
    // Only notes the Interviewer has not touched are replaced. A Confirmed, Corrected, or
    // Dismissed note is their work, so it stays, Stale if the mapping changed since.
    db.prepare("DELETE FROM ai_note WHERE interview_id = ? AND review_state = 'unreviewed'").run(interviewId);
    const insertNote = db.prepare(
      "INSERT INTO ai_note (id, interview_id, statement, review_state, generated_at, position, source) VALUES (?, ?, ?, 'unreviewed', ?, ?, ?)",
    );
    const insertEvidence = db.prepare(
      "INSERT INTO ai_note_evidence (ai_note_id, position, segment_number, quote) VALUES (?, ?, ?, ?)",
    );
    for (const [i, note] of notes.entries()) {
      const id = randomUUID();
      insertNote.run(id, interviewId, note.statement.trim(), generatedAt, i + 1, source);
      for (const [j, evidence] of note.evidence.entries()) {
        insertEvidence.run(id, j + 1, evidence.segmentNumber, evidence.quote);
      }
    }
  });
}

// The newest generation first, each in the order the model gave its notes.
export function listAiNotes(db: DatabaseSync, interviewId: string): AiNote[] {
  requireInterview(db, interviewId);
  const notes = db
    .prepare(
      `${selectNotes} WHERE ai_note.interview_id = ? ORDER BY generated_at DESC, position`,
    )
    .all(interviewId) as unknown as NoteRow[];
  return toAiNotes(db, notes);
}

const selectNotes = `SELECT ai_note.id, ai_note.interview_id, statement, correction, review_state, generated_at, source,
         generated_at < speaker_mapping_confirmed_at AS stale
  FROM ai_note JOIN transcript ON transcript.interview_id = ai_note.interview_id`;

interface NoteRow {
  id: string;
  interview_id: string;
  statement: string;
  correction: string | null;
  review_state: ReviewState;
  generated_at: string;
  source: AiSource;
  stale: number;
}

function getAiNote(db: DatabaseSync, id: string): AiNote {
  const row = db.prepare(`${selectNotes} WHERE ai_note.id = ?`).get(id) as unknown as NoteRow | undefined;
  if (!row) throw new NotFoundError("AI Note not found.");
  return toAiNotes(db, [row])[0]!;
}

function setReviewState(db: DatabaseSync, id: string, reviewState: ReviewState): AiNote {
  db.prepare("UPDATE ai_note SET review_state = ? WHERE id = ?").run(reviewState, id);
  return getAiNote(db, id);
}

// A Dismissed note is hidden, so it is shown again before it can be confirmed or corrected.
function requireShown(note: AiNote): void {
  if (note.reviewState === "dismissed") {
    throw new PreconditionError("noteDismissed", "This note was dismissed. Show it again first.");
  }
}

// The Interviewer says the note reflects its Evidence. It says nothing about whether the Candidate was right.
// A Corrected note cannot be confirmed: that would put the AI's text back above the Interviewer's.
export function confirmAiNote(db: DatabaseSync, id: string): AiNote {
  const note = getAiNote(db, id);
  requireShown(note);
  if (note.reviewState === "corrected") {
    throw new PreconditionError("noteCorrected", "This note was corrected. Edit the correction instead.");
  }
  return setReviewState(db, id, "confirmed");
}

// The Interviewer rewrites the note. The AI's statement and its Evidence stay, so it is always
// visible what the AI said and what the Interviewer changed.
export function correctAiNote(db: DatabaseSync, id: string, correction: string): AiNote {
  const text = correction.trim();
  if (text === "") throw new InvalidInputError("correction", "required", "Write the corrected note.");
  requireShown(getAiNote(db, id));
  db.prepare("UPDATE ai_note SET review_state = 'corrected', correction = ? WHERE id = ?").run(text, id);
  return getAiNote(db, id);
}

// Hidden from the panel, never deleted, so it can be shown again.
export function dismissAiNote(db: DatabaseSync, id: string): AiNote {
  getAiNote(db, id);
  return setReviewState(db, id, "dismissed");
}

// Shows a Dismissed note again. A note the Interviewer had corrected comes back with its
// correction; any other comes back Unreviewed.
export function restoreAiNote(db: DatabaseSync, id: string): AiNote {
  const note = getAiNote(db, id);
  if (note.reviewState !== "dismissed") return note;
  return setReviewState(db, id, note.correction === null ? "unreviewed" : "corrected");
}

function toAiNotes(db: DatabaseSync, notes: NoteRow[]): AiNote[] {
  const evidenceOf = db.prepare(
    "SELECT segment_number, quote FROM ai_note_evidence WHERE ai_note_id = ? ORDER BY position",
  );
  return notes.map((note) => ({
    id: note.id,
    interviewId: note.interview_id,
    statement: note.statement,
    correction: note.correction,
    reviewState: note.review_state,
    generatedAt: note.generated_at,
    source: note.source,
    stale: note.stale === 1,
    evidence: (evidenceOf.all(note.id) as unknown as { segment_number: number; quote: string }[]).map((row) => ({
      segmentNumber: row.segment_number,
      quote: row.quote,
    })),
  }));
}
