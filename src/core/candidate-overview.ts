import type { DatabaseSync } from "node:sqlite";
import { listCandidates, requireCandidate, type Candidate } from "./candidates.ts";
import { getCv } from "./cv.ts";
import { InvalidInputError } from "./errors.ts";
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
  // The Candidate has no Interview at all, with or without a date (hasNoInterviewYet).
  noInterviewYet: boolean;
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

// The columns of the Candidate list that it can be ordered by.
export const candidateOrders = ["name", "interview", "cvAndQuestions"] as const;

export interface CandidateOrder {
  by: (typeof candidateOrders)[number];
  // The other way round. A Candidate with no dated Interview stays last either way.
  reversed?: boolean;
}

// Every Candidate's overview. With no order, the newest Candidate comes first, as in
// listCandidates. With one, the whole list is ordered, so the order holds on every page of it:
// - name: the Turkish alphabet, as the interface is used mostly in Turkish;
// - interview: the Interview the row shows first (the next Planned one, or else the latest that
//   has taken place), earliest first; a Candidate with no dated Interview comes last;
// - cvAndQuestions: with a CV first, then the most Saved Questions.
// Equal Candidates are ordered by name.
export function listCandidateOverviews(db: DatabaseSync, today: Today, order?: CandidateOrder): CandidateOverview[] {
  const overviews = listCandidates(db).map((candidate) => getCandidateOverview(db, today, candidate.id));
  if (order === undefined) return overviews;
  if (!candidateOrders.includes(order.by)) {
    throw new InvalidInputError("by", "format", "The list can be ordered by name, interview, or cvAndQuestions.");
  }
  const alphabetical = new Intl.Collator("tr", { sensitivity: "accent" });
  const byName = (a: CandidateOverview, b: CandidateOverview) => alphabetical.compare(a.candidate.name, b.candidate.name);
  const direction = order.reversed ? -1 : 1;
  const compare: Record<CandidateOrder["by"], (a: CandidateOverview, b: CandidateOverview) => number> = {
    name: (a, b) => direction * byName(a, b),
    interview: (a, b) => {
      const [whenA, whenB] = [shownInterviewTime(a), shownInterviewTime(b)];
      if (whenA === null || whenB === null) return whenA === whenB ? byName(a, b) : whenA === null ? 1 : -1;
      // Plain text order: the day and time are written so that it is the order in time.
      return whenA === whenB ? byName(a, b) : direction * (whenA < whenB ? -1 : 1);
    },
    cvAndQuestions: (a, b) =>
      direction * (Number(b.cv !== null) - Number(a.cv !== null) || b.savedQuestionCount - a.savedQuestionCount || byName(a, b)),
  };
  return overviews.sort(compare[order.by]);
}

// The day and time of the Interview a row of the list shows first, as text that sorts by time.
function shownInterviewTime(overview: CandidateOverview): string | null {
  const interview = overview.nextPlanned ?? overview.latestTakenPlace;
  return interview?.date ? `${interview.date} ${interview.time ?? ""}` : null;
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
    noInterviewYet: hasNoInterviewYet(interviews),
    interviewerNoteCount: listInterviewerNotes(db, candidateId).length,
    savedQuestionCount: listSavedQuestions(db, candidateId).length,
  };
}

// The rule of the Candidate list's "No Interview yet" view: not one Interview has been added,
// Planned, undated, or taken place. Such a Candidate is still waiting to be planned.
export function hasNoInterviewYet(interviews: readonly Interview[]): boolean {
  return interviews.length === 0;
}

// An Interview with its Candidate, for the Candidate list and the calendar.
export interface DatedInterview {
  candidate: Candidate;
  interview: Interview;
  // The Interview is today, whether it is still Planned or has taken place.
  today: boolean;
  // The Interview is between today and the Sunday that ends this week, both included.
  thisWeek: boolean;
}

// Every Candidate's Interviews that have a date, earliest first. Within a day, those without a
// time come after the timed ones; Interviews at the same time are in the order of their
// Candidates' names. The Planned ones, in this order, are what comes next for the Interviewer.
export function listDatedInterviews(db: DatabaseSync, today: Today): DatedInterview[] {
  const { day } = today();
  const sunday = sundayOnOrAfter(day);
  return listCandidates(db)
    .flatMap((candidate) =>
      listInterviews(db, today, candidate.id)
        .filter((interview) => interview.date !== null)
        .map((interview) => ({
          candidate,
          interview,
          today: interview.date === day,
          thisWeek: interview.date! >= day && interview.date! <= sunday,
        })),
    )
    .sort(
      (a, b) =>
        byText(a.interview.date!, b.interview.date!) ||
        // "~" comes after every digit, so an Interview without a time comes last in its day.
        byText(a.interview.time ?? "~", b.interview.time ?? "~") ||
        a.candidate.name.localeCompare(b.candidate.name, "tr"),
    );
}

// The Sunday that ends the week of this day; weeks start on Monday.
function sundayOnOrAfter(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7));
  return date.toISOString().slice(0, 10);
}

// Days and times are compared character by character, not by the rules of a language.
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
