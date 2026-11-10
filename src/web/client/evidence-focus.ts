import type { Highlight } from "./api.ts";

// The search result the Interviewer clicked, so the panel that shows its source can open that
// place and mark the match. The id is new on every click, so clicking the same result again
// brings the place back into view.
export type EvidenceFocus =
  | { id: number; source: "cv"; page: number; marks: string[] }
  | { id: number; source: "transcript"; interviewId: string; segmentNumber: number; highlights: Highlight[] };
