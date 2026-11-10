import type { Highlight } from "./api.ts";

// The CV match an Evidence search result points to, so the CV panel can open its page and mark
// it. The highlights are positions in the page's whole text. The id is new on every click, so
// clicking the same result again brings it back into view. Transcript results use the
// Transcript panel's SegmentHighlight instead.
export interface CvFocus {
  id: number;
  page: number;
  highlights: Highlight[];
}
