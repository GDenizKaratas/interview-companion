import type { DatabaseSync } from "node:sqlite";
import { listAiNotes } from "./ai-notes.ts";
import { hasApiKey } from "./ai-settings.ts";
import { listAskedQuestions } from "./asked-questions.ts";
import { requireInterview } from "./interviews.ts";
import { getTranscript } from "./transcripts.ts";

// What the Interviewer does next to get an Interview's Asked Questions and AI Notes:
// - "importTranscript": the Interview has no Transcript yet.
// - "confirmSpeakers": the Speaker Mapping is not confirmed.
// - "connectAi": the app has no API key. An AI client can still do the work through MCP.
// - "run": everything is ready and nothing has been made yet.
// - "done": there are Asked Questions or AI Notes, whoever made them.
export type InterviewAiStep = "importTranscript" | "confirmSpeakers" | "connectAi" | "run" | "done";

// The steps are named in the order they are needed. The Transcript and the speakers come before
// the AI connection, because both ways of using AI need them, and an Interview that has not
// taken place has nothing to connect AI for. Refuses an unknown Interview with NotFoundError.
export function getInterviewAiStep(db: DatabaseSync, interviewId: string): InterviewAiStep {
  requireInterview(db, interviewId);
  const transcript = getTranscript(db, interviewId);
  if (!transcript) return "importTranscript";
  if (transcript.speakerMappingConfirmedAt === null) return "confirmSpeakers";
  if (listAskedQuestions(db, interviewId) !== null || listAiNotes(db, interviewId).length > 0) return "done";
  return hasApiKey(db) ? "run" : "connectAi";
}
