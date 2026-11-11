import type { Precondition } from "../../core/index.ts";
import { ApiError } from "./api.ts";
import type { Text } from "./languages.ts";

// Words for every Precondition core can refuse with, in the current language. The result is a
// complete Record over core's type, so a new Precondition in core is a type error here until it
// has words; no panel can fall back to a vague message for it without notice.
export function preconditionMessages(text: Text): Record<Precondition, string> {
  const notes = text.panels.aiNotes.errors.reasons;
  const suggestions = text.panels.questions.suggestions.reasons;
  return {
    apiKeyMissing: notes.apiKeyMissing,
    candidateExists: text.refusals.candidateExists,
    aiClientWritesOff: text.refusals.aiClientWritesOff,
    noTranscript: notes.noTranscript,
    speakerMappingNotConfirmed: notes.speakerMappingNotConfirmed,
    transcriptChanged: notes.transcriptChanged,
    noteCorrected: notes.noteCorrected,
    noteDismissed: notes.noteDismissed,
    suggestionAccepted: suggestions.suggestionAccepted,
    suggestionDismissed: suggestions.suggestionDismissed,
  };
}

// Why core refused an action, when it gave a Precondition or an AI failure; otherwise the
// fallback. Field and rule refusals depend on the form, so each panel words those itself first.
// An AI failure says the data is unchanged, because core saves nothing unless the model call works.
export function refusalText(text: Text, error: unknown, fallback: string): string {
  // The server and this page come from one build, so the codes match; the checks for a missing
  // text only keep an odd answer from showing "undefined".
  if (error instanceof ApiError) {
    const reason = error.reason && preconditionMessages(text)[error.reason];
    if (reason) return reason;
    const t = text.panels.aiNotes.errors;
    const failure = error.failure && t.failures[error.failure];
    if (failure) return `${t.failed} ${failure}`;
  }
  return fallback;
}

// What went wrong when AI work was asked for: AI Notes, asked questions, or suggestions.
export function generationErrorMessage(text: Text, error: unknown): string {
  return refusalText(text, error, text.panels.aiNotes.errors.failed);
}
