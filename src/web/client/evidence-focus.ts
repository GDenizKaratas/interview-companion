import type { Highlight } from "./api.ts";

// The search result the Interviewer clicked, so the panel that shows its source can open that
// place and mark the match. The id is new on every click, so clicking the same result again
// brings the place back into view.

// For the CV, the highlights are positions in the page's whole text.
export interface CvFocus {
  id: number;
  source: "cv";
  page: number;
  highlights: Highlight[];
}

// For a Transcript, the highlights are positions in the segment's text.
export interface TranscriptFocus {
  id: number;
  source: "transcript";
  interviewId: string;
  segmentNumber: number;
  highlights: Highlight[];
}

export type EvidenceFocus = CvFocus | TranscriptFocus;
