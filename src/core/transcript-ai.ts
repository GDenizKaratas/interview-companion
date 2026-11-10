import type { DatabaseSync } from "node:sqlite";
import { AiProviderError, PreconditionError } from "./errors.ts";
import { requireInterview } from "./interviews.ts";
import { getTranscript, type SpeakerRole, type Transcript } from "./transcripts.ts";

// What AI Notes and Asked Questions share: both read one Interview's Transcript with a confirmed
// Speaker Mapping, send its segments with their roles, and check quotes against its segments.

// Work on a Transcript needs its speakers confirmed, so every quote is known to be whose it is.
export function requireConfirmedTranscript(db: DatabaseSync, interviewId: string): Transcript {
  requireInterview(db, interviewId);
  const transcript = getTranscript(db, interviewId);
  if (!transcript) throw new PreconditionError("noTranscript", "Import a Transcript first.");
  if (transcript.speakerMappingConfirmedAt === null) {
    throw new PreconditionError("speakerMappingNotConfirmed", "Confirm who is speaking first.");
  }
  return transcript;
}

// Every segment in spoken order with its confirmed role. Speaker labels are left out: they can be
// real names, and the role is what the model needs.
export function segmentsWithRoles(transcript: Transcript): { number: number; role: SpeakerRole; text: string }[] {
  const roles = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker.role!]));
  return transcript.segments.map((segment) => ({
    number: segment.number,
    role: roles.get(segment.speakerId)!,
    text: segment.text,
  }));
}

// The text of each segment said by one role, by segment number, for checking quotes.
export function segmentsOf(transcript: Transcript, role: SpeakerRole): Map<number, string> {
  return new Map(segmentsWithRoles(transcript).filter((s) => s.role === role).map((s) => [s.number, s.text]));
}

// Calls the model. A failure that is not already an AiProviderError becomes one, so the caller
// always gets the same kind of error and knows nothing was changed.
export async function callModel<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw error instanceof AiProviderError
      ? error
      : new AiProviderError("unavailable", "Generation failed. Your data was not changed.", { cause: error });
  }
}

// The model takes a while. If the Transcript was replaced or its mapping confirmed again
// meanwhile, the answer rests on data that is gone, so it must not be saved.
export function requireTranscriptUnchanged(db: DatabaseSync, transcript: Transcript): void {
  const current = getTranscript(db, transcript.interviewId);
  if (
    current?.importedAt !== transcript.importedAt ||
    current.speakerMappingConfirmedAt !== transcript.speakerMappingConfirmedAt
  ) {
    throw new PreconditionError(
      "transcriptChanged",
      "The Transcript or its speakers changed during generation. Nothing was saved; generate again.",
    );
  }
}
