import type { DatabaseSync } from "node:sqlite";
import { requireCandidate, type Candidate } from "./candidates.ts";
import { getCv } from "./cv.ts";
import { listInterviewerNotes } from "./interviewer-notes.ts";
import { listInterviews, type Interview, type Today } from "./interviews.ts";
import { listSavedQuestions } from "./saved-questions.ts";
import { getTranscript } from "./transcripts.ts";

// One Candidate at a glance: what exists, without the full texts.
export interface CandidateOverview {
  candidate: Candidate;
  // null when no CV has been added.
  cv: { fileName: string; uploadedAt: string; pageCount: number } | null;
  // In the same order and with the same numbers as listInterviews.
  interviews: InterviewOverview[];
  interviewerNoteCount: number;
  savedQuestionCount: number;
}

export interface InterviewOverview extends Interview {
  // null when the Interview has no Transcript.
  transcript: {
    fileName: string;
    format: string;
    segmentCount: number;
    speakerMappingConfirmed: boolean;
  } | null;
}

export function getCandidateOverview(db: DatabaseSync, today: Today, candidateId: string): CandidateOverview {
  const candidate = requireCandidate(db, candidateId);
  const cv = getCv(db, candidateId);
  return {
    candidate,
    cv: cv ? { fileName: cv.fileName, uploadedAt: cv.uploadedAt, pageCount: cv.pages.length } : null,
    interviews: listInterviews(db, today, candidateId).map((interview) => {
      const transcript = getTranscript(db, interview.id);
      return {
        ...interview,
        transcript: transcript
          ? {
              fileName: transcript.fileName,
              format: transcript.format,
              segmentCount: transcript.segments.length,
              speakerMappingConfirmed: transcript.speakerMappingConfirmedAt !== null,
            }
          : null,
      };
    }),
    interviewerNoteCount: listInterviewerNotes(db, candidateId).length,
    savedQuestionCount: listSavedQuestions(db, candidateId).length,
  };
}
