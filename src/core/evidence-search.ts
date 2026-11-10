import type { DatabaseSync } from "node:sqlite";
import { requireCandidate } from "./candidates.ts";
import { getCv } from "./cv.ts";
import { InvalidInputError } from "./errors.ts";
import { listInterviews, type Today } from "./interviews.ts";
import { getTranscript, type SpeakerRole } from "./transcripts.ts";
import { sameLetter } from "./turkish-letters.ts";

// Which sources a search covers. Exported so the MCP tool can list the same choices in its schema.
export const evidenceSources = ["all", "cv", "transcripts"] as const;
export type EvidenceSources = (typeof evidenceSources)[number];

export interface EvidenceQuery {
  query: string;
  sources: EvidenceSources;
  // Only Transcript segments whose speaker is the Candidate in a confirmed Speaker Mapping.
  candidateOnly: boolean;
}

// Where a match is inside an excerpt, as string positions: excerpt.slice(start, end).
export interface Highlight {
  start: number;
  end: number;
}

export interface TranscriptEvidence {
  source: "transcript";
  interviewId: string;
  segmentNumber: number;
  speakerLabel: string;
  // The role in the confirmed Speaker Mapping, or null before it is confirmed.
  speakerRole: SpeakerRole | null;
  startMs: number | null;
  endMs: number | null;
  // The segment's text, exactly as stored.
  excerpt: string;
  highlights: Highlight[];
}

export interface CvEvidence {
  source: "cv";
  page: number;
  // The whole line (or lines) of the page the match is on, exactly as stored.
  excerpt: string;
  // Where the excerpt starts in the page's text, so the interface can find the match on the page.
  excerptStart: number;
  highlights: Highlight[];
}

export type EvidenceResult = CvEvidence | TranscriptEvidence;

export interface EvidenceSearch {
  results: EvidenceResult[];
  // Where the term was found: in the CV, in which Interviews, or both.
  foundIn: { cv: boolean; interviewIds: string[] };
  // Interviews whose Transcript a Candidate-only search left out, because its Speaker Mapping is
  // not confirmed yet. Empty for other searches.
  unconfirmedInterviewIds: string[];
}

export function searchEvidence(db: DatabaseSync, today: Today, candidateId: string, query: EvidenceQuery): EvidenceSearch {
  requireCandidate(db, candidateId);
  if (!evidenceSources.includes(query.sources)) {
    throw new InvalidInputError("sources", "format", "Search all sources, the CV, or the Transcripts.");
  }
  const terms = wordsOf(query.query).map((word) => word.letters);
  if (terms.length === 0) throw new InvalidInputError("search", "required", "Type a word to search for.");
  const cvResults = query.sources === "transcripts" ? [] : searchCv(db, candidateId, terms);
  const transcripts =
    query.sources === "cv"
      ? { results: [], unconfirmedInterviewIds: [] }
      : searchTranscripts(db, today, candidateId, terms, query.candidateOnly);
  const interviewIds = [...new Set(transcripts.results.map((result) => result.interviewId))];
  return {
    results: [...cvResults, ...transcripts.results],
    foundIn: { cv: cvResults.length > 0, interviewIds },
    unconfirmedInterviewIds: transcripts.unconfirmedInterviewIds,
  };
}

// One result per line of a page with a match. A match that runs over a line break takes in
// both lines.
function searchCv(db: DatabaseSync, candidateId: string, terms: string[][]): CvEvidence[] {
  const results: CvEvidence[] = [];
  for (const page of getCv(db, candidateId)?.pages ?? []) {
    for (const match of findMatches(page.text, terms)) {
      const start = page.text.lastIndexOf("\n", match.start - 1) + 1;
      const lineEnd = page.text.indexOf("\n", match.end);
      const end = lineEnd === -1 ? page.text.length : lineEnd;
      const highlight = { start: match.start - start, end: match.end - start };
      const last = results.at(-1);
      // Matches on the same line are one result; equal lines elsewhere on the page are not.
      if (last && last.page === page.number && last.excerptStart === start && last.excerpt.length === end - start) {
        last.highlights.push(highlight);
      } else {
        const excerpt = page.text.slice(start, end);
        results.push({ source: "cv", page: page.number, excerpt, excerptStart: start, highlights: [highlight] });
      }
    }
  }
  return results;
}

function searchTranscripts(
  db: DatabaseSync,
  today: Today,
  candidateId: string,
  terms: string[][],
  candidateOnly: boolean,
): { results: TranscriptEvidence[]; unconfirmedInterviewIds: string[] } {
  const results: TranscriptEvidence[] = [];
  const unconfirmedInterviewIds: string[] = [];
  for (const interview of listInterviews(db, today, candidateId)) {
    const transcript = getTranscript(db, interview.id);
    if (!transcript) continue;
    // Before the mapping is confirmed, no speaker is known to be the Candidate.
    if (candidateOnly && transcript.speakers.some((speaker) => !speaker.verified)) {
      unconfirmedInterviewIds.push(interview.id);
      continue;
    }
    const speakers = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker]));
    for (const segment of transcript.segments) {
      const speaker = speakers.get(segment.speakerId)!;
      if (candidateOnly && speaker.role !== "candidate") continue;
      const highlights = findMatches(segment.text, terms);
      if (highlights.length === 0) continue;
      results.push({
        source: "transcript",
        interviewId: interview.id,
        segmentNumber: segment.number,
        speakerLabel: speaker.label,
        speakerRole: speaker.role,
        startMs: segment.startMs,
        endMs: segment.endMs,
        excerpt: segment.text,
        highlights,
      });
    }
  }
  return { results, unconfirmedInterviewIds };
}

interface Word {
  start: number;
  end: number;
  letters: string[];
}

// Letters, marks, and digits make a word; anything else, such as a space or an apostrophe, ends it.
function wordsOf(text: string): Word[] {
  return [...text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    letters: [...match[0].normalize("NFC")],
  }));
}

// Each place where the search words begin consecutive words of the text, in order. A search word
// matches the start of a word, so a Turkish suffix after it still matches: "Redis" finds
// "Redis'i" and "Redisle". The highlight covers the whole words.
function findMatches(text: string, terms: string[][]): Highlight[] {
  const words = wordsOf(text);
  const highlights: Highlight[] = [];
  for (let i = 0; i + terms.length <= words.length; i++) {
    if (terms.every((term, k) => startsWith(words[i + k]!.letters, term))) {
      highlights.push({ start: words[i]!.start, end: words[i + terms.length - 1]!.end });
    }
  }
  return highlights;
}

function startsWith(letters: string[], term: string[]): boolean {
  return term.length <= letters.length && term.every((letter, i) => sameLetter(letter, letters[i]!));
}
