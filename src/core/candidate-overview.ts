import type { DatabaseSync } from "node:sqlite";
import { listCandidates, requireCandidate, type Candidate } from "./candidates.ts";
import { getCv } from "./cv.ts";
import { listInterviewerNotes } from "./interviewer-notes.ts";
import { hasTakenPlace, listInterviews, type Interview, type Today } from "./interviews.ts";
import { listSavedQuestions } from "./saved-questions.ts";
import { getTranscript } from "./transcripts.ts";

// One Candidate at a glance: what exists, without the full texts.
export interface CandidateOverview {
  candidate: Candidate;
  // null when no CV has been added.
  cv: { fileName: string; uploadedAt: string; pageCount: number } | null;
  // In the same order and with the same numbers as listInterviews.
  interviews: InterviewOverview[];
  // The earliest Planned Interview, or null when none is Planned.
  nextPlanned: Interview | null;
  // The latest Interview that has taken place, or null when none has.
  latestTakenPlace: Interview | null;
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
  const interviews = listInterviews(db, today, candidateId);
  return {
    candidate,
    cv: cv ? { fileName: cv.fileName, uploadedAt: cv.uploadedAt, pageCount: cv.pages.length } : null,
    interviews: interviews.map((interview) => {
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
    nextPlanned: interviews.find((interview) => interview.planned) ?? null,
    latestTakenPlace: interviews.findLast(hasTakenPlace) ?? null,
    interviewerNoteCount: listInterviewerNotes(db, candidateId).length,
    savedQuestionCount: listSavedQuestions(db, candidateId).length,
  };
}

// An Interview with its Candidate, for the Candidate list and the calendar.
export interface DatedInterview {
  candidate: Candidate;
  interview: Interview;
}

// Every Candidate's Interviews that have a date, earliest first. Within a day, those without a
// time come after the timed ones; Interviews at the same time are in the order of their
// Candidates' names. The Planned ones, in this order, are what comes next for the Interviewer.
export function listDatedInterviews(db: DatabaseSync, today: Today): DatedInterview[] {
  return listCandidates(db)
    .flatMap((candidate) =>
      listInterviews(db, today, candidate.id)
        .filter((interview) => interview.date !== null)
        .map((interview) => ({ candidate, interview })),
    )
    .sort(
      (a, b) =>
        byText(a.interview.date!, b.interview.date!) ||
        // "~" comes after every digit, so an Interview without a time comes last in its day.
        byText(a.interview.time ?? "~", b.interview.time ?? "~") ||
        a.candidate.name.localeCompare(b.candidate.name, "tr"),
    );
}

// Days and times are compared character by character, not by the rules of a language.
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
